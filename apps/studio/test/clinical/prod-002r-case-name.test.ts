/**
 * PROD-002R — case name persistence regression (Create → Save → Reopen).
 */

import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { MemoryClinicalCasePersistence } from '../../src/clinical/case/ClinicalCasePersistence.js';
import { ClinicalWorkspace } from '../../src/clinical/workspace/ClinicalWorkspace.js';
import { createEmptyClinicalDocument } from '../../src/clinical/document/ClinicalDocument.js';

const bootWithMemory = () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 9100 }
  });
  const runtimeBoot = new ClinicalBootstrap().bootstrap(host);
  const persistence = new MemoryClinicalCasePersistence();
  const workspace = new ClinicalWorkspace(runtimeBoot.session, undefined, persistence);
  return { host, runtime: runtimeBoot.runtime, session: runtimeBoot.session, workspace, persistence };
};

const attach = async (host: StudioCompositionRoot) => {
  expect(
    await host.attachViewport({
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      getContext: () => null
    })
  ).toBe(true);
};

const saveReopen = async (
  workspace: ClinicalWorkspace,
  session: ReturnType<typeof bootWithMemory>['session'],
  host: StudioCompositionRoot
) => {
  const caseId = session.getPublicState().activeCase!.caseId;
  const saved = await workspace.cases.saveActiveCase(workspace);
  expect(saved.ok).toBe(true);

  session.closeCase(true);
  host.runtimes.kernel.registry.clear();
  workspace.importCoordinator.objects.clear();
  expect(session.getPublicState().activeCase).toBeUndefined();

  const opened = await workspace.cases.openCase(workspace, caseId);
  expect(opened.ok).toBe(true);
  return { caseId, opened: opened.ok ? opened.value : undefined };
};

describe('PROD-002R case name persistence', () => {
  it('preserves numeric-only case names through Create → Save → Reopen', async () => {
    const name = '1234567890';
    const { host, runtime, session, workspace } = bootWithMemory();
    await attach(host);

    const created = session.newCase({ patientName: 'Numeric Patient', name });
    expect(created.ok).toBe(true);
    expect(session.getPublicState().activeCase!.caseMeta.name).toBe(name);

    const { opened } = await saveReopen(workspace, session, host);
    expect(opened?.caseMeta.name).toBe(name);

    runtime.dispose();
    host.dispose();
  });

  it('preserves hyphenated long case names through Create → Save → Reopen', async () => {
    const name = 'Patient-2026-09-12-Upper-Lower';
    const { host, runtime, session, workspace } = bootWithMemory();
    await attach(host);

    const created = session.newCase({ patientName: 'Long Name Patient', name });
    expect(created.ok).toBe(true);
    expect(session.getPublicState().activeCase!.caseMeta.name).toBe(name);

    const { opened } = await saveReopen(workspace, session, host);
    expect(opened?.caseMeta.name).toBe(name);

    runtime.dispose();
    host.dispose();
  });

  it('accepts case names up to 120 characters without silent truncation', async () => {
    const name = 'P'.repeat(120);
    expect(name.length).toBe(120);

    const doc = createEmptyClinicalDocument({ now: 42, name, patientName: 'Max Length' });
    expect(doc.caseMeta.name).toBe(name);
    expect(doc.caseMeta.name.length).toBe(120);

    const persistence = new MemoryClinicalCasePersistence();
    await persistence.save({ document: doc, meshes: Object.freeze([]), savedAt: 42 });
    const loaded = await persistence.load(doc.caseId);
    expect(loaded?.document.caseMeta.name).toBe(name);
    expect(loaded?.document.caseMeta.name.length).toBe(120);

    const listed = await persistence.list();
    expect(listed[0]?.name).toBe(name);
    expect(listed[0]?.name.length).toBe(120);

    const { host, runtime, session, workspace } = bootWithMemory();
    await attach(host);
    const created = session.newCase({ patientName: 'Max Length', name });
    expect(created.ok).toBe(true);
    expect(session.getPublicState().activeCase!.caseMeta.name).toBe(name);
    expect(session.getPublicState().activeCase!.caseMeta.name.length).toBe(120);

    const { opened } = await saveReopen(workspace, session, host);
    expect(opened?.caseMeta.name).toBe(name);
    expect(opened?.caseMeta.name.length).toBe(120);

    runtime.dispose();
    host.dispose();
  });
});
