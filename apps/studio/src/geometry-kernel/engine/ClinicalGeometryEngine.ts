/**
 * GEO-001 — ClinicalGeometryEngine façade.
 *
 * Lives behind Geometry Services / Kernel Bridge. Clinical UI remains a consumer
 * via Operation Runtime — never call mutating paths from React.
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import type { GeometryBackend } from '../adapters/GeometryBackend.js';
import { NativeReferenceBackend } from '../adapters/GeometryBackend.js';
import { analyzeMesh, calculateMetrics } from './MeshAnalysis.js';
import { buildTopology, extractBoundaryLoops, invalidateTopologyCache } from './TopologyGraph.js';
import {
  buildClinicalSpatialIndex,
  invalidateSpatialCache,
  nearestSurfacePoint,
  projectPointToSurface,
  rayIntersectMesh
} from './SpatialAcceleration.js';
import {
  closeSurfacePath,
  createSurfacePath,
  measureSurfacePath,
  resampleSurfacePath,
  validateSurfacePath
} from './SurfacePath.js';
import { ClinicalTrimEngine } from './ClinicalTrimEngine.js';
import { ClinicalBaseEngine } from './ClinicalBaseEngine.js';
import { repairMesh } from './MeshRepair.js';
import {
  DEFAULT_TOPOLOGY_WELD_POLICY,
  normalizeMeshTopology,
  type TopologyNormalizationResult,
  type TopologyWeldPolicy
} from './TopologyNormalization.js';
import { selectBackendForCapability } from './BackendCapability.js';
import type {
  BaseEngineInput,
  BaseEngineResult,
  ClinicalMesh,
  GeometryCapability,
  GeometryMetrics,
  MeshQualityReport,
  SurfacePath,
  SurfaceQueryResult,
  TrimEngineInput,
  TrimEngineResult
} from './types.js';
import { asClinicalMesh } from './types.js';

export interface ClinicalGeometryEngineOptions {
  readonly backend?: GeometryBackend;
  readonly vtkHealthy?: boolean;
}

export class ClinicalGeometryEngine {
  private readonly backend: GeometryBackend;
  private readonly vtkHealthy: boolean | undefined;
  private readonly trimEngine: ClinicalTrimEngine;
  private readonly baseEngine: ClinicalBaseEngine;

  public constructor(options?: ClinicalGeometryEngineOptions) {
    this.backend = options?.backend ?? new NativeReferenceBackend();
    this.vtkHealthy = options?.vtkHealthy;
    const engineOpts =
      this.vtkHealthy === undefined ? undefined : { vtkHealthy: this.vtkHealthy };
    this.trimEngine = new ClinicalTrimEngine(this.backend, engineOpts);
    this.baseEngine = new ClinicalBaseEngine(this.backend, engineOpts);
  }

  public wrapMesh(mesh: TriangleMesh, arch?: ClinicalMesh['arch']): ClinicalMesh {
    return asClinicalMesh(mesh, arch === undefined ? undefined : { arch });
  }

  public analyzeMesh(mesh: TriangleMesh): MeshQualityReport {
    return analyzeMesh(mesh);
  }

  public buildTopology(mesh: TriangleMesh) {
    return buildTopology(mesh);
  }

  public buildSpatialIndex(mesh: TriangleMesh) {
    return buildClinicalSpatialIndex(mesh);
  }

  public projectToSurface(
    mesh: TriangleMesh,
    point: readonly [number, number, number],
    maxDistance = 2
  ): SurfaceQueryResult {
    return projectPointToSurface(mesh, point, undefined, maxDistance);
  }

  public rayIntersect(
    mesh: TriangleMesh,
    origin: readonly [number, number, number],
    direction: readonly [number, number, number]
  ): SurfaceQueryResult {
    return rayIntersectMesh(mesh, origin, direction);
  }

  public nearestSurface(
    mesh: TriangleMesh,
    point: readonly [number, number, number],
    maxDistance?: number
  ): SurfaceQueryResult {
    return nearestSurfacePoint(mesh, point, undefined, maxDistance);
  }

  public buildSurfacePath(
    mesh: TriangleMesh,
    seeds: readonly {
      readonly point: readonly [number, number, number];
      readonly faceId?: number;
      readonly normal?: readonly [number, number, number];
    }[],
    options?: { readonly closed?: boolean; readonly reconstruct?: boolean }
  ) {
    return createSurfacePath(mesh, seeds, options);
  }

  public validateSurfacePath(
    mesh: TriangleMesh,
    path: SurfacePath,
    options?: { readonly minSamples?: number; readonly maxSpacingMm?: number; readonly minLengthMm?: number }
  ) {
    return validateSurfacePath(mesh, path, options);
  }

  public resampleSurfacePath(mesh: TriangleMesh, path: SurfacePath, spacingMm = 0.35): SurfacePath {
    return resampleSurfacePath(mesh, path, spacingMm);
  }

  public closeSurfacePath(mesh: TriangleMesh, path: SurfacePath) {
    return closeSurfacePath(mesh, path);
  }

  public measureSurfacePath(path: SurfacePath) {
    return measureSurfacePath(path);
  }

  public async trim(input: TrimEngineInput): Promise<TrimEngineResult> {
    return this.trimEngine.trim(input);
  }

  public extractBoundaries(mesh: TriangleMesh) {
    return extractBoundaryLoops(mesh);
  }

  public async createBase(input: BaseEngineInput): Promise<BaseEngineResult> {
    return this.baseEngine.createBase(input);
  }

  public repairMesh(mesh: TriangleMesh): TriangleMesh {
    const repaired = repairMesh(mesh);
    invalidateTopologyCache(mesh.fingerprint);
    invalidateSpatialCache(mesh.fingerprint);
    return repaired;
  }

  /** GEO-001B — exact (default) topology normalization for import WORKING meshes. */
  public normalizeTopology(
    mesh: TriangleMesh,
    policy: TopologyWeldPolicy = DEFAULT_TOPOLOGY_WELD_POLICY
  ): TopologyNormalizationResult {
    const result = normalizeMeshTopology(mesh, policy);
    invalidateTopologyCache(mesh.fingerprint);
    invalidateSpatialCache(mesh.fingerprint);
    invalidateTopologyCache(result.mesh.fingerprint);
    invalidateSpatialCache(result.mesh.fingerprint);
    return result;
  }

  public validateGeometry(mesh: TriangleMesh): MeshQualityReport {
    return analyzeMesh(mesh);
  }

  public calculateMetrics(mesh: TriangleMesh): GeometryMetrics {
    return calculateMetrics(mesh);
  }

  public selectBackend(capability: GeometryCapability) {
    return selectBackendForCapability(
      capability,
      this.vtkHealthy === undefined ? undefined : { vtkHealthy: this.vtkHealthy }
    );
  }

  public invalidateCaches(fingerprint?: string): void {
    invalidateTopologyCache(fingerprint);
    invalidateSpatialCache(fingerprint);
  }
}

/** Singleton helper for read-only analysis from studio services (not React). */
let sharedEngine: ClinicalGeometryEngine | undefined;

export const getClinicalGeometryEngine = (
  options?: ClinicalGeometryEngineOptions
): ClinicalGeometryEngine => {
  if (options?.backend !== undefined || options?.vtkHealthy !== undefined) {
    return new ClinicalGeometryEngine(options);
  }
  if (sharedEngine === undefined) {
    sharedEngine = new ClinicalGeometryEngine();
  }
  return sharedEngine;
};
