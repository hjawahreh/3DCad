/**
 * GEO-002 — fingerprint-scoped clinical geometry context.
 *
 * Holds reusable topology / spatial / quality / backend session state for one
 * working geometry fingerprint. Invalidated when the fingerprint changes.
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import type { GeometryQualityReport } from '../quality/GeometryQualityPipeline.js';
import type { SpatialIndex } from '../spatial/SpatialIndex.js';
import type { ClinicalSpatialIndex } from '../engine/SpatialAcceleration.js';
import type { TopologyGraph } from '../engine/TopologyGraph.js';
import type {
  GeometryWarmupState,
  GeometryWarmupTimings
} from './GeometryWarmup.js';

export type GeometryCacheEvent = 'HIT' | 'MISS' | 'INVALIDATED';

export interface ClinicalGeometryContext {
  readonly geometryFingerprint: string;
  readonly objectId: string;
  readonly mesh: TriangleMesh;
  topology?: TopologyGraph;
  clinicalSpatial?: ClinicalSpatialIndex;
  /** Bridge KD-tree (optional; VTK trim may skip). */
  spatialKd?: SpatialIndex;
  qualitySummary?: GeometryQualityReport;
  workerSessionId?: string;
  /** GEO-003 editing readiness for this fingerprint. */
  readyState?: GeometryWarmupState;
  warmupTimings?: GeometryWarmupTimings;
  readonly createdAtMs: number;
  hits: number;
  misses: number;
}

export interface OperationContext {
  readonly geometryFingerprint: string;
  readonly objectId: string;
  readonly targetArch?: string;
  readonly clinical: ClinicalGeometryContext;
  readonly preview: boolean;
  readonly requestId: string;
}

export class ClinicalGeometryContextRegistry {
  private readonly byObject = new Map<string, ClinicalGeometryContext>();
  private readonly events: Array<{
    readonly at: string;
    readonly objectId: string;
    readonly fingerprint: string;
    readonly event: GeometryCacheEvent;
    readonly field: string;
  }> = [];

  public getOrCreate(mesh: TriangleMesh): ClinicalGeometryContext {
    const existing = this.byObject.get(mesh.objectId);
    if (
      existing !== undefined &&
      existing.geometryFingerprint === mesh.fingerprint
    ) {
      existing.hits += 1;
      this.record(mesh.objectId, mesh.fingerprint, 'HIT', 'context');
      return existing;
    }
    if (existing !== undefined) {
      this.record(
        mesh.objectId,
        existing.geometryFingerprint,
        'INVALIDATED',
        'context'
      );
    }
    const next: ClinicalGeometryContext = {
      geometryFingerprint: mesh.fingerprint,
      objectId: mesh.objectId,
      mesh,
      createdAtMs: performance.now(),
      hits: 0,
      misses: 1
    };
    this.byObject.set(mesh.objectId, next);
    this.record(mesh.objectId, mesh.fingerprint, 'MISS', 'context');
    return next;
  }

  public get(objectId: string): ClinicalGeometryContext | undefined {
    return this.byObject.get(objectId);
  }

  public invalidate(objectId: string): void {
    const existing = this.byObject.get(objectId);
    if (existing !== undefined) {
      this.record(objectId, existing.geometryFingerprint, 'INVALIDATED', 'context');
      this.byObject.delete(objectId);
    }
  }

  public invalidateAll(): void {
    for (const id of [...this.byObject.keys()]) this.invalidate(id);
  }

  public record(
    objectId: string,
    fingerprint: string,
    event: GeometryCacheEvent,
    field: string
  ): void {
    this.events.push({
      at: new Date().toISOString(),
      objectId,
      fingerprint,
      event,
      field
    });
    if (this.events.length > 200) this.events.shift();
  }

  public drainEvents(): typeof this.events {
    const out = [...this.events];
    this.events.length = 0;
    return out;
  }

  public snapshot(objectId: string, preview: boolean, requestId: string): OperationContext | null {
    const clinical = this.byObject.get(objectId);
    if (clinical === undefined) return null;
    return {
      geometryFingerprint: clinical.geometryFingerprint,
      objectId,
      clinical,
      preview,
      requestId
    };
  }
}

/** Process-wide registry used by Kernel Bridge / SurfacePath helpers. */
export const clinicalGeometryContexts = new ClinicalGeometryContextRegistry();
