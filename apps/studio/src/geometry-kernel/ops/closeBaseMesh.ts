/**
 * Close-base mesh ops — GEO-001D routes plane/offset/surface through clinical-base-v2.
 * AABB is never the source of the clinical base perimeter.
 */

import {
  computeAABB,
  createMesh,
  fingerprintMesh,
  type TriangleMesh
} from '../mesh/TriangleMesh.js';
import { runGeometryQualityPipeline, type GeometryQualityReport } from '../quality/GeometryQualityPipeline.js';
import { GeometryKernelError } from '../errors.js';
import {
  constructClinicalBase,
  type BaseQualityReport
} from '../engine/ClinicalBaseConstruction.js';

export type CloseBaseOrientation = 'xy' | 'xz' | 'yz';
export type CloseBaseStrategy = 'plane' | 'surface' | 'offset';

/** Hard caps retained for diagnostics / construction sampling. */
export const CLOSE_BASE_MAX_BOUNDARY_EDGES = 12_000;
/** Preserve full clinical border; stride-subsample at 256 chorded arches into slabs. */
export const CLOSE_BASE_MAX_LOOP_VERTICES = 8_192;
export const CLOSE_BASE_MAX_ADDED_TRIANGLES = 80_000;
export const CLOSE_BASE_MAX_ELAPSED_MS = 8_000;
export const CLOSE_BASE_MAX_LOOPS = 4;

export interface CloseBaseOptions {
  readonly strategy: CloseBaseStrategy;
  readonly height?: number;
  readonly thickness?: number;
  readonly margin?: number;
  readonly orientation?: CloseBaseOrientation;
  readonly planeNormal?: readonly [number, number, number] | undefined;
  readonly preferRequestedOrientation?: boolean;
  readonly role?: TriangleMesh['role'];
  readonly revision?: number;
  readonly id?: number;
  readonly shouldAbort?: () => boolean;
  readonly maxElapsedMs?: number;
}

export interface CloseBaseResult {
  readonly mesh: TriangleMesh;
  readonly quality: GeometryQualityReport;
  readonly baseQuality?: BaseQualityReport;
  readonly boundaryLoops: number;
  readonly addedTriangles: number;
  readonly warnings: readonly string[];
  readonly elapsedMs: number;
  readonly extrudeAxis: 0 | 1 | 2;
}

/** Open dental surfaces: shortest AABB span ≈ surface normal ≈ extrusion axis. */
export const inferCloseBaseExtrudeAxis = (mesh: TriangleMesh): 0 | 1 | 2 => {
  const aabb = computeAABB(mesh.positions);
  const sx = Math.max(0, aabb.max[0] - aabb.min[0]);
  const sy = Math.max(0, aabb.max[1] - aabb.min[1]);
  const sz = Math.max(0, aabb.max[2] - aabb.min[2]);
  if (sx <= sy && sx <= sz) return 0;
  if (sy <= sx && sy <= sz) return 1;
  return 2;
};

const axisFromNormal = (
  planeNormal: readonly [number, number, number] | undefined,
  orientation: CloseBaseOrientation = 'xy'
): 0 | 1 | 2 => {
  if (planeNormal !== undefined) {
    const ax = Math.abs(planeNormal[0]);
    const ay = Math.abs(planeNormal[1]);
    const az = Math.abs(planeNormal[2]);
    if (ax >= ay && ax >= az) return 0;
    if (ay >= ax && ay >= az) return 1;
    return 2;
  }
  if (orientation === 'yz') return 0;
  if (orientation === 'xz') return 1;
  return 2;
};

export const closeBaseMesh = (mesh: TriangleMesh, options: CloseBaseOptions): CloseBaseResult => {
  const started = performance.now();
  if (options.shouldAbort?.() === true) {
    throw new GeometryKernelError('CANCELLED', 'Close Base cancelled');
  }

  const axis =
    options.preferRequestedOrientation === true
      ? axisFromNormal(options.planeNormal, options.orientation ?? 'xy')
      : inferCloseBaseExtrudeAxis(mesh);

  const constructed = constructClinicalBase({
    mesh,
    strategy: options.strategy,
    height: options.height ?? 2,
    thickness: options.thickness ?? 1.5,
    offset: options.margin ?? 0,
    ...(options.planeNormal !== undefined ? { clinicalBaseNormal: options.planeNormal } : {}),
    preferClinicalFrame: options.preferRequestedOrientation === true,
    ...(options.role === undefined ? {} : { role: options.role }),
    ...(options.revision === undefined ? {} : { revision: options.revision }),
    ...(options.id === undefined ? {} : { id: options.id }),
    maxBoundarySamples: CLOSE_BASE_MAX_LOOP_VERTICES
  });

  if (!constructed.ok) {
    if (constructed.code === 'NO_BOUNDARY') {
      const quality = runGeometryQualityPipeline(mesh);
      return {
        mesh: createMesh({
          id: options.id ?? mesh.id,
          objectId: mesh.objectId,
          role: options.role ?? 'working',
          revision: options.revision ?? mesh.revision + 1,
          positions: new Float32Array(mesh.positions),
          indices: new Uint32Array(mesh.indices),
          fingerprint: fingerprintMesh(mesh.positions, mesh.indices)
        }),
        quality,
        boundaryLoops: 0,
        addedTriangles: 0,
        warnings: ['No open boundary detected; mesh may already be closed'],
        elapsedMs: performance.now() - started,
        extrudeAxis: axis
      };
    }
    throw new GeometryKernelError(
      'VALIDATION_FAILED',
      constructed.message || `Close Base V2 failed: ${constructed.code}`
    );
  }

  if (constructed.quality.blockingFailures.length > 0) {
    throw new GeometryKernelError(
      'VALIDATION_FAILED',
      `Base quality gate failed: ${constructed.quality.blockingFailures.join(', ')}`
    );
  }

  const quality = runGeometryQualityPipeline(constructed.mesh);
  const bq = constructed.quality;
  return {
    mesh: constructed.mesh,
    quality,
    baseQuality: bq,
    boundaryLoops: 1,
    addedTriangles: constructed.addedTriangles,
    warnings: [
      ...constructed.warnings,
      `baseV2:watertight=${String(bq.watertight)}`,
      `baseV2:slab=${String(bq.slabDetection.detected)}`,
      `baseV2:bridges=${String(bq.diagonalBridgeDetection.suspiciousFaceCount)}`,
      `baseV2:bridgeRejected=${String(bq.diagonalBridgeDetection.rejected)}`,
      `baseV2:boundaryMatch=${String(bq.boundaryMatch.passed)}`,
      `baseV2:boundaryEdges=${String(bq.boundaryEdgeCount)}`,
      ...Object.entries(bq.stageTimingsMs).map(([k, v]) => `baseV2:timing:${k}=${v.toFixed(1)}ms`)
    ],
    elapsedMs: performance.now() - started,
    extrudeAxis: axis
  };
};
