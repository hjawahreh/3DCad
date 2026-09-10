/**
 * Clinical geometry cache invalidation policy.
 * Caches invalidate when source revision changes; stale fingerprints cannot commit.
 */

import type { ClinicalMeshRevisionRef } from './MeshRoles.js';

export type ClinicalGeometryCacheKind =
  | 'normals'
  | 'bounds'
  | 'topology'
  | 'connected-components'
  | 'spatial-index'
  | 'fingerprint'
  | 'display-mesh'
  | 'operation-preview';

export const CLINICAL_GEOMETRY_CACHE_KINDS = Object.freeze([
  'normals',
  'bounds',
  'topology',
  'connected-components',
  'spatial-index',
  'fingerprint',
  'display-mesh',
  'operation-preview'
] as const satisfies readonly ClinicalGeometryCacheKind[]);

export interface ClinicalGeometryCacheEntryMeta {
  readonly kind: ClinicalGeometryCacheKind;
  readonly objectId: string;
  /** Source / working revision the cache was built against. */
  readonly sourceRevision: number;
  readonly fingerprint: string;
  readonly createdAt: number;
}

export interface ClinicalGeometryCacheValidity {
  readonly valid: boolean;
  readonly reason: string | undefined;
}

/** True when the cache entry still matches the live source revision + fingerprint. */
export const isClinicalGeometryCacheValid = (
  entry: ClinicalGeometryCacheEntryMeta,
  live: Pick<ClinicalMeshRevisionRef, 'objectId' | 'revision' | 'fingerprint'>
): ClinicalGeometryCacheValidity => {
  if (entry.objectId !== live.objectId) {
    return Object.freeze({ valid: false, reason: 'object-mismatch' });
  }
  if (entry.sourceRevision !== live.revision) {
    return Object.freeze({ valid: false, reason: 'source-revision-changed' });
  }
  if (entry.fingerprint !== live.fingerprint) {
    return Object.freeze({ valid: false, reason: 'fingerprint-mismatch' });
  }
  return Object.freeze({ valid: true, reason: undefined });
};

/** Stale fingerprints must never be allowed to commit. */
export const canCommitWithCacheFingerprint = (
  expectedFingerprint: string,
  candidateFingerprint: string,
  sourceRevisionMatched: boolean
): ClinicalGeometryCacheValidity => {
  if (!sourceRevisionMatched) {
    return Object.freeze({ valid: false, reason: 'source-revision-changed' });
  }
  if (expectedFingerprint !== candidateFingerprint) {
    return Object.freeze({ valid: false, reason: 'stale-fingerprint' });
  }
  return Object.freeze({ valid: true, reason: undefined });
};

export const shouldInvalidateAllCachesForRevisionChange = (
  previousRevision: number,
  nextRevision: number
): boolean => previousRevision !== nextRevision;

export const cachesInvalidatedBySourceRevisionChange =
  CLINICAL_GEOMETRY_CACHE_KINDS;
