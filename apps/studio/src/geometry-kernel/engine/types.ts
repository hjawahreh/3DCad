/**
 * GEO-001 — shared clinical geometry engine contracts.
 * Algorithms live here; React/UI never imports VTK or mutates MeshRegistry.
 */

import type { AABB, MeshRole, TriangleMesh } from '../mesh/TriangleMesh.js';

/** ClinicalMesh is the stable engine view of TriangleMesh (+ optional metadata). */
export interface ClinicalMesh {
  readonly mesh: TriangleMesh;
  readonly units: 'mm';
  readonly coordinateFrame: 'mesh-local';
  readonly arch?: 'UPPER' | 'LOWER' | 'UNKNOWN';
  readonly revision: number;
  readonly fingerprint: string;
}

export type GeometryGate = 'PASS' | 'WARNING' | 'FAIL';

export type SelfIntersectionStatus = 'none' | 'suspected' | 'unknown';

export interface MeshQualityReport {
  readonly gate: GeometryGate;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly connectedComponentCount: number;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly degenerateTriangleCount: number;
  readonly isolatedVertexCount: number;
  readonly bbox: AABB;
  readonly surfaceArea: number;
  readonly volume: number | undefined;
  readonly watertight: boolean;
  readonly manifold: boolean;
  readonly selfIntersectionStatus: SelfIntersectionStatus;
  readonly fingerprint: string;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly durationMs: number;
}

export interface GeometryMetrics {
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly surfaceArea: number;
  readonly bounds: AABB;
  readonly volume: number | undefined;
  readonly boundaryCount: number;
  readonly boundaryLength: number;
  readonly connectedComponents: number;
  readonly manifold: boolean;
  readonly watertight: boolean;
  readonly selfIntersection: SelfIntersectionStatus;
  readonly fingerprint: string;
}

export interface GeometryDiagnostics {
  readonly code: string;
  readonly stage: string;
  readonly operation: string;
  readonly backend: string;
  readonly geometryRevision: number;
  readonly targetArch?: string;
  readonly metricsBefore?: GeometryMetrics;
  readonly metricsAfter?: GeometryMetrics;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly durationMs: number;
}

export interface SurfaceHit {
  readonly hit: true;
  readonly point: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly faceId: number;
  readonly distance: number;
  readonly componentId: number;
  readonly barycentric?: readonly [number, number, number];
}

export interface SurfaceMiss {
  readonly hit: false;
}

export type SurfaceQueryResult = SurfaceHit | SurfaceMiss;

export interface SurfacePathSample {
  readonly point: readonly [number, number, number];
  readonly normal?: readonly [number, number, number];
  readonly faceId: number;
  readonly componentId: number;
}

export interface SurfacePath {
  readonly samples: readonly SurfacePathSample[];
  readonly length: number;
  readonly closed: boolean;
  readonly fingerprint: string;
  readonly meshFingerprint: string;
}

export type TrimKeepModeEngine = 'KEEP_OUTSIDE' | 'KEEP_INSIDE' | 'remove-interior' | 'keep-interior';

export interface TrimEngineInput {
  readonly mesh: TriangleMesh;
  readonly surfacePath: SurfacePath;
  readonly keepMode: TrimKeepModeEngine;
  readonly targetArch?: string;
  readonly role?: MeshRole;
  readonly revision?: number;
  readonly clinicalBaseNormal?: readonly [number, number, number];
}

export interface TrimEngineResult {
  readonly success: boolean;
  readonly outputMesh?: TriangleMesh;
  readonly selectedRegion?: { readonly triangleCount: number; readonly surfaceArea: number };
  readonly removedRegion?: { readonly triangleCount: number; readonly surfaceArea: number };
  readonly removedSurfaceArea: number;
  readonly inputTriangleCount: number;
  readonly outputTriangleCount: number;
  readonly affectedTriangleCount: number;
  readonly newVertexCount: number;
  readonly boundaryLoops: number;
  readonly diagnostics: GeometryDiagnostics;
  readonly durationMs: number;
  readonly qualityBefore?: MeshQualityReport;
  readonly qualityAfter?: MeshQualityReport;
}

export type BaseStrategyEngine = 'plane' | 'surface' | 'offset';

export interface BaseEngineInput {
  readonly trimmedMesh: TriangleMesh;
  readonly baseStrategy: BaseStrategyEngine;
  readonly parameters: {
    readonly height?: number;
    readonly thickness?: number;
    readonly offset?: number;
    readonly clinicalBaseNormal?: readonly [number, number, number];
    readonly preferClinicalFrame?: boolean;
  };
  readonly role?: MeshRole;
  readonly revision?: number;
}

export interface BaseEngineResult {
  readonly success: boolean;
  readonly outputMesh?: TriangleMesh;
  readonly boundaryLoops: number;
  readonly addedTriangles: number;
  readonly selectedBoundary?: BoundaryLoopCandidate;
  readonly diagnostics: GeometryDiagnostics;
  readonly durationMs: number;
  readonly qualityBefore?: MeshQualityReport;
  readonly qualityAfter?: MeshQualityReport;
  readonly baseQuality?: import('./ClinicalBaseConstruction.js').BaseQualityReport;
}

export interface BoundaryLoopCandidate {
  readonly id: number;
  readonly vertexIndices: readonly number[];
  readonly perimeter: number;
  readonly projectedArea: number;
  readonly centroid: readonly [number, number, number];
  readonly closed: boolean;
  readonly score: number;
  readonly reasons: readonly string[];
}

export type GeometryCapability =
  | 'TRIM_SURFACE_SELECTION'
  | 'TRIM_CLIPPING'
  | 'BOUNDARY_EXTRACTION'
  | 'TRIANGULATION'
  | 'BASE_GENERATION'
  | 'MESH_REPAIR'
  | 'SOLID_BOOLEAN'
  | 'VALIDATION';

export interface BackendSelection {
  readonly capability: GeometryCapability;
  readonly backendId: string;
  readonly reason: string;
}

export const asClinicalMesh = (
  mesh: TriangleMesh,
  options?: { readonly arch?: ClinicalMesh['arch'] }
): ClinicalMesh =>
  Object.freeze({
    mesh,
    units: 'mm',
    coordinateFrame: 'mesh-local',
    ...(options?.arch === undefined ? {} : { arch: options.arch }),
    revision: mesh.revision,
    fingerprint: mesh.fingerprint
  });
