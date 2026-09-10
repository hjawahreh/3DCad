export type {
  CachedEntityProjection
} from './cache.js';
export { ProjectionCache, entityFingerprint } from './cache.js';
export type { ProjectionContext, ProjectionDependencies, ProjectionWorkingState } from './context.js';
export type {
  DocumentEntityView,
  DocumentRevisionView
} from './document.js';
export {
  aabb,
  createDocumentEntity,
  createDocumentRevision,
  translate,
  vec3
} from './document.js';
export { BoundsBuilder } from './bounds-builder.js';
export { ProjectionDiagnostics, type ProjectionDiagnostic } from './diagnostics.js';
export { SceneProjectionEngine, type SceneProjectionEngineOptions } from './engine.js';
export { EntityMapper } from './entity-mapper.js';
export { ProjectionLifecycle, type ProjectionLifecyclePhase } from './lifecycle.js';
export { ProjectionMetrics, type ProjectionMetricsSnapshot } from './metrics.js';
export { PickingIdRegistry } from './picking-id-registry.js';
export { ProjectionPipeline } from './pipeline.js';
export { ProjectionRegistry } from './registry.js';
export type { EntityChange, EntityChangeKind, RevisionDiff } from './revision-diff.js';
export { RevisionDiffEngine } from './revision-diff.js';
export { SceneRevision } from './revision.js';
export { SelectionProxyBuilder, type SelectionProxy } from './selection-proxy-builder.js';
export type {
  MaterialDescriptor,
  RenderableDescriptor,
  SceneSnapshot,
  SceneSnapshotDiagnostics,
  SceneSnapshotMetrics,
  TransformDescriptor
} from './snapshot.js';
export { freezeSnapshot } from './snapshot.js';
export type {
  SpatialIndex,
  SpatialIndexHit,
  SpatialIndexQuery
} from './spatial-index.js';
export { ReservedSpatialIndex } from './spatial-index.js';
export type {
  Aabb,
  Brand,
  DocumentRevisionId,
  DomainEntityId,
  Mat4,
  PickingId,
  SceneEntityId,
  SceneError,
  SceneErrorCode,
  SceneLayer,
  SceneResult,
  SceneRevisionId,
  Vec3
} from './types.js';
export {
  asDocumentRevisionId,
  asDomainEntityId,
  asPickingId,
  asSceneEntityId,
  asSceneRevisionId,
  emptyAabb,
  IDENTITY_MAT4,
  sceneFailure,
  sceneSuccess
} from './types.js';
export { VisibilityBuilder, type VisibilityDescriptor } from './visibility-builder.js';
export { SceneWorld } from './world.js';
