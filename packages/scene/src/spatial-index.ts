/**
 * Spatial index — CONTRACT ONLY (COD-007).
 * No BVH / geometry implementation. Future milestone may supply an adapter.
 */
import type { Aabb, DomainEntityId, SceneEntityId } from './types.js';
import { sceneFailure, type SceneResult } from './types.js';

export interface SpatialIndexQuery {
  readonly bounds: Aabb;
}

export interface SpatialIndexHit {
  readonly sceneEntityId: SceneEntityId;
  readonly domainEntityId: DomainEntityId;
  readonly bounds: Aabb;
}

export interface SpatialIndex {
  readonly implementation: 'none' | 'reserved';
  rebuild(entries: readonly SpatialIndexHit[]): SceneResult<void>;
  query(query: SpatialIndexQuery): SceneResult<readonly SpatialIndexHit[]>;
  clear(): void;
}

/** Reserved stub: always empty; signals that spatial indexing is not implemented. */
export class ReservedSpatialIndex implements SpatialIndex {
  readonly implementation = 'reserved' as const;

  public rebuild(_entries: readonly SpatialIndexHit[]): SceneResult<void> {
    return sceneFailure(
      'unavailable',
      'SpatialIndex is reserved; BVH/geometry indexing is not part of COD-007'
    );
  }

  public query(_query: SpatialIndexQuery): SceneResult<readonly SpatialIndexHit[]> {
    return sceneFailure(
      'unavailable',
      'SpatialIndex is reserved; BVH/geometry indexing is not part of COD-007'
    );
  }

  public clear(): void {
    // no-op
  }
}
