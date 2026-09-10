import type { VisibilityDescriptor } from './visibility-builder.js';
import type { SelectionProxy } from './selection-proxy-builder.js';
import type {
  Aabb,
  DomainEntityId,
  Mat4,
  PickingId,
  SceneEntityId,
  SceneLayer,
  SceneRevisionId
} from './types.js';
import type { DocumentRevisionId } from './types.js';

export interface TransformDescriptor {
  readonly sceneEntityId: SceneEntityId;
  readonly matrix: Mat4;
}

export interface MaterialDescriptor {
  readonly sceneEntityId: SceneEntityId;
  readonly materialRef: string | undefined;
}

export interface RenderableDescriptor {
  readonly sceneEntityId: SceneEntityId;
  readonly domainEntityId: DomainEntityId;
  readonly kind: string;
  readonly layer: SceneLayer;
  readonly geometryRef: string | undefined;
  readonly transform: TransformDescriptor;
  readonly material: MaterialDescriptor;
  readonly bounds: Aabb;
  readonly visibility: VisibilityDescriptor;
  readonly pickingId: PickingId;
  readonly selectionProxy: SelectionProxy;
}

export interface SceneSnapshotDiagnostics {
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly projectionMs: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
}

export interface SceneSnapshotMetrics {
  readonly entitiesProjected: number;
  readonly entitiesUpdated: number;
  readonly entitiesRemoved: number;
  readonly cacheEfficiency: number;
  readonly estimatedBytes: number;
  readonly revisionCount: number;
}

/**
 * Immutable render snapshot. Zero mutable state. Renderer consumes; never mutates.
 */
export interface SceneSnapshot {
  readonly sceneRevision: SceneRevisionId;
  readonly documentRevision: DocumentRevisionId;
  readonly renderables: readonly RenderableDescriptor[];
  readonly worldBounds: Aabb;
  readonly diagnostics: SceneSnapshotDiagnostics;
  readonly metrics: SceneSnapshotMetrics;
  readonly createdAt: number;
}

export const freezeSnapshot = (snapshot: SceneSnapshot): SceneSnapshot =>
  Object.freeze({
    ...snapshot,
    renderables: Object.freeze([...snapshot.renderables]),
    diagnostics: Object.freeze({ ...snapshot.diagnostics }),
    metrics: Object.freeze({ ...snapshot.metrics })
  });
