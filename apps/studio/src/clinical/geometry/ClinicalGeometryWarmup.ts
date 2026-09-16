/**
 * GEO-003 — clinical façade over GeometryWarmupService.
 * Triggers warmup after Prepare / case open / geometry mutation.
 */

import {
  geometryWarmup,
  type GeometryWarmupBackend,
  type GeometryWarmupStatus
} from '../../geometry-kernel/context/GeometryWarmup.js';
import type { TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import type { HybridGeometryBackend } from '../../geometry-kernel/adapters/HybridGeometryBackend.js';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalArchRole } from '../import/ClinicalMeshDescriptor.js';

export interface WarmArchMeshInput {
  readonly objectId: string;
  readonly archRole?: ClinicalArchRole;
  readonly mesh: TriangleMesh;
}

const resolveBackend = (session: ClinicalSession): GeometryWarmupBackend | undefined => {
  const backend = session.getHost().runtimes.kernel.backend as HybridGeometryBackend | undefined;
  if (
    backend !== undefined &&
    typeof (backend as HybridGeometryBackend).ensureVtkGeometry === 'function'
  ) {
    return backend;
  }
  return undefined;
};

const notifyWarmup = (
  session: ClinicalSession,
  status: GeometryWarmupStatus,
  options?: { readonly quiet?: boolean }
): void => {
  if (options?.quiet === true) return;
  const host = session.getHost();
  if (status.state === 'WARMING') {
    host.notifications.push('progress', 'Geometry', status.userMessage);
    return;
  }
  if (status.state === 'READY') {
    host.notifications.push('success', 'Geometry', status.userMessage);
    return;
  }
  if (status.state === 'FAILED') {
    host.notifications.push('error', 'Geometry', status.userMessage);
  }
};

/**
 * Warm all provided arch meshes in parallel (UPPER / LOWER independent).
 * Non-blocking for the caller after kickoff — returns the aggregate promise.
 */
export const startClinicalGeometryWarmup = (
  session: ClinicalSession,
  arches: readonly WarmArchMeshInput[],
  options?: { readonly quiet?: boolean; readonly force?: boolean }
): Promise<readonly GeometryWarmupStatus[]> => {
  if (arches.length === 0) {
    return Promise.resolve(Object.freeze([]));
  }
  const caseId = session.getPublicState().activeCase?.caseId as string | undefined;
  const backend = resolveBackend(session);
  const tasks = arches.map((arch) =>
    geometryWarmup.warmMesh(arch.mesh, {
      ...(arch.archRole !== undefined ? { arch: arch.archRole } : {}),
      ...(caseId !== undefined ? { caseId } : {}),
      ...(backend !== undefined ? { backend } : {}),
      ...(options?.force === true ? { force: true } : {}),
      onStage: (status) => {
        notifyWarmup(session, status, options);
        session.notifyUi();
      }
    })
  );
  return Promise.all(tasks).then((results) => Object.freeze(results));
};

export const rewarmAfterGeometryMutation = (
  session: ClinicalSession,
  mesh: TriangleMesh,
  archRole?: ClinicalArchRole
): Promise<GeometryWarmupStatus> => {
  const caseId = session.getPublicState().activeCase?.caseId as string | undefined;
  const backend = resolveBackend(session);
  return geometryWarmup.invalidateAndRewarm(mesh, {
    ...(archRole !== undefined ? { arch: archRole } : {}),
    ...(caseId !== undefined ? { caseId } : {}),
    ...(backend !== undefined ? { backend } : {}),
    onStage: (status) => {
      notifyWarmup(session, status);
      session.notifyUi();
    }
  });
};

export const cancelClinicalGeometryWarmup = (): void => {
  geometryWarmup.invalidateAll();
};

export const getEditingReadinessMessage = (
  objectId: string,
  fingerprint: string
): string | undefined => {
  const status = geometryWarmup.getStatus(objectId);
  if (status === undefined || status.geometryFingerprint !== fingerprint) {
    return 'Preparing editing tools…';
  }
  if (status.state === 'READY') return undefined;
  return status.userMessage;
};

export const isGeometryEditingReady = (
  objectId: string,
  fingerprint: string
): boolean => geometryWarmup.isReady(objectId, fingerprint);
