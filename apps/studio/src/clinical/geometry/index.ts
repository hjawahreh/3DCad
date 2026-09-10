export type {
  ClinicalMeshRole,
  ClinicalMeshRevisionRef
} from './MeshRoles.js';
export {
  CLINICAL_MESH_ROLES,
  createClinicalMeshRevisionRef,
  isAuthoritativeMeshRole,
  isEphemeralMeshRole
} from './MeshRoles.js';

export type {
  ClinicalGeometryErrorCategory,
  ClinicalGeometryError,
  ClinicalGeometryResult
} from './ClinicalGeometryErrors.js';
export {
  CLINICAL_GEOMETRY_ERROR_CATEGORIES,
  createClinicalGeometryError,
  clinicalGeometrySuccess,
  clinicalGeometryFailure
} from './ClinicalGeometryErrors.js';

export type {
  ClinicalGeometryMeshSizeSample,
  ClinicalGeometryMetricsSnapshot
} from './ClinicalGeometryMetrics.js';
export { ClinicalGeometryMetrics } from './ClinicalGeometryMetrics.js';

export type {
  ClinicalGeometryCacheKind,
  ClinicalGeometryCacheEntryMeta,
  ClinicalGeometryCacheValidity
} from './ClinicalGeometryCachePolicy.js';
export {
  CLINICAL_GEOMETRY_CACHE_KINDS,
  isClinicalGeometryCacheValid,
  canCommitWithCacheFingerprint,
  shouldInvalidateAllCachesForRevisionChange,
  cachesInvalidatedBySourceRevisionChange
} from './ClinicalGeometryCachePolicy.js';

export type {
  ClinicalGeometryStatistics,
  ClinicalGeometryOperationMeta
} from './ClinicalGeometryOperationMeta.js';
export { createClinicalGeometryOperationMeta } from './ClinicalGeometryOperationMeta.js';

export type {
  ClinicalGeometryKernelCommitResult,
  ClinicalGeometryObjectMetadata,
  ClinicalGeometryMetadataMap
} from './ClinicalGeometryDocumentDelta.js';
export {
  clinicalGeometryMetadataFromCommit,
  mergeClinicalGeometryMetadata,
  applyClinicalGeometryCommitToDescriptor,
  applyClinicalGeometryCommitToObjects
} from './ClinicalGeometryDocumentDelta.js';
