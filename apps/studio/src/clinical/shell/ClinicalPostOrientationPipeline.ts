/**
 * CLN-WORKFLOW-002 — post-orientation guided pipeline.
 * Accept Orientation → prepare → warmup → automatically open Trim.
 * Prepare is a pipeline stage, not a destination.
 */

import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { startClinicalGeometryWarmup } from '../geometry/ClinicalGeometryWarmup.js';

const yieldUi = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 16);
  });

/**
 * Run after Orientation Accept succeeds.
 * Shows PREPARING SCAN… stages, confirms preparation, warms geometry, opens Trim UPPER.
 */
export const runPostOrientationPipeline = async (
  workspace: ClinicalWorkspace
): Promise<{ readonly ok: boolean; readonly message?: string }> => {
  const host = workspace.session.getHost();
  const notify = (message: string): void => {
    host.notifications.push('progress', 'Preparing scan', message);
    workspace.session.notifyUi();
  };

  notify('Preparing geometry');
  await yieldUi();

  workspace.preparation.notifyOrientationComplete();
  const prep = workspace.preparation.autoPrepare();
  if (!prep.ok) {
    host.notifications.push('warning', 'Prepare', prep.error.message);
    return { ok: false, message: prep.error.message };
  }

  notify('Preparing editing tools');
  await yieldUi();

  try {
    const doc = workspace.session.getPublicState().activeCase;
    if (doc !== undefined) {
      const jobs = doc.objects
        .filter((o) => o.archRole === 'upper' || o.archRole === 'lower')
        .map((o) => {
          const mesh =
            host.runtimes.kernel.registry.getByObjectId(String(o.id), 'working') ??
            host.runtimes.kernel.registry.getByObjectId(String(o.id), 'source');
          if (mesh === undefined) return undefined;
          return {
            objectId: mesh.objectId,
            archRole: (o.archRole ?? 'upper') as 'upper' | 'lower',
            mesh
          };
        })
        .filter((j): j is NonNullable<typeof j> => j !== undefined);
      if (jobs.length > 0) {
        await Promise.race([
          startClinicalGeometryWarmup(workspace.session, jobs),
          new Promise<void>((r) => {
            setTimeout(r, 8000);
          })
        ]);
      }
    }
  } catch {
    /* warmup best-effort */
  }

  notify('Ready');
  await yieldUi();

  workspace.archContext.setMode('upper');
  const entered = workspace.trim.enter();
  if (!entered.ok) {
    host.notifications.push('warning', 'Trim', entered.error.message);
    return { ok: false, message: entered.error.message };
  }
  const arch = workspace.trim.setActiveArch('upper');
  if (!arch.ok) {
    /* enter may already have set upper */
  }
  host.notifications.push(
    'success',
    'Trim',
    'Upper arch ready — draw to trim, release to cut.'
  );
  workspace.session.notifyUi();
  return { ok: true };
};
