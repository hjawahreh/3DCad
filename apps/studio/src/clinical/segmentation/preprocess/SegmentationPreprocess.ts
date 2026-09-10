/**
 * Segmentation preprocessing — never mutates authoritative clinical mesh.
 * Maintains sampled/feature → source face mapping.
 */

import {
  computeAABB,
  cloneMesh,
  fingerprintMesh,
  meshStats,
  type TriangleMesh
} from '../../../geometry-kernel/mesh/TriangleMesh.js';
import { runGeometryQualityPipeline } from '../../../geometry-kernel/quality/GeometryQualityPipeline.js';
import { SegmentationError } from '../errors.js';
import { PREPROCESSING_VERSION } from '../prediction/types.js';

export interface SamplePointMapping {
  readonly sampleIndex: number;
  readonly faceIndex: number;
  readonly barycentric: readonly [number, number, number];
}

export interface PreprocessResult {
  readonly version: string;
  readonly sourceFingerprint: string;
  readonly sourceRevision: number;
  readonly objectId: string;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly aabb: ReturnType<typeof computeAABB>;
  readonly scale: number;
  readonly sampleMappings: readonly SamplePointMapping[];
  /** Normalized centroid positions per face (deterministic features). */
  readonly faceCentroids: Float32Array;
  readonly faceNormals: Float32Array;
  readonly warnings: readonly string[];
  readonly timingMs: number;
}

const faceCentroidAndNormal = (
  mesh: TriangleMesh,
  faceIndex: number
): {
  readonly c: readonly [number, number, number];
  readonly n: readonly [number, number, number];
} => {
  const i0 = mesh.indices[faceIndex * 3]!;
  const i1 = mesh.indices[faceIndex * 3 + 1]!;
  const i2 = mesh.indices[faceIndex * 3 + 2]!;
  const ax = mesh.positions[i0 * 3]!;
  const ay = mesh.positions[i0 * 3 + 1]!;
  const az = mesh.positions[i0 * 3 + 2]!;
  const bx = mesh.positions[i1 * 3]!;
  const by = mesh.positions[i1 * 3 + 1]!;
  const bz = mesh.positions[i1 * 3 + 2]!;
  const cx = mesh.positions[i2 * 3]!;
  const cy = mesh.positions[i2 * 3 + 1]!;
  const cz = mesh.positions[i2 * 3 + 2]!;
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  return {
    c: [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
    n: [nx, ny, nz]
  };
};

export const preprocessSegmentationMesh = (
  mesh: TriangleMesh,
  options?: { readonly signal?: AbortSignal }
): PreprocessResult => {
  const started = performance.now();
  if (options?.signal?.aborted) {
    throw new SegmentationError('CANCELLED', 'Preprocessing cancelled');
  }
  // Clone so callers cannot mutate source through this path.
  const working = cloneMesh(mesh);
  const quality = runGeometryQualityPipeline(working);
  let nonFinite = 0;
  for (let i = 0; i < working.positions.length; i += 1) {
    if (!Number.isFinite(working.positions[i]!)) nonFinite += 1;
  }
  if (nonFinite > 0) {
    throw new SegmentationError('INVALID_INPUT', 'Mesh contains non-finite coordinates');
  }
  if (quality.stats.triangleCount === 0) {
    throw new SegmentationError('INVALID_INPUT', 'Mesh has no triangles');
  }
  const stats = meshStats(working);
  const aabb = computeAABB(working.positions);
  const dx = aabb.max[0] - aabb.min[0];
  const dy = aabb.max[1] - aabb.min[1];
  const dz = aabb.max[2] - aabb.min[2];
  const scale = Math.max(dx, dy, dz, 1e-6);
  const faceCentroids = new Float32Array(stats.triangleCount * 3);
  const faceNormals = new Float32Array(stats.triangleCount * 3);
  const sampleMappings: SamplePointMapping[] = [];
  for (let f = 0; f < stats.triangleCount; f += 1) {
    if (options?.signal?.aborted) {
      throw new SegmentationError('CANCELLED', 'Preprocessing cancelled');
    }
    const { c, n } = faceCentroidAndNormal(working, f);
    faceCentroids[f * 3] = (c[0] - aabb.min[0]) / scale;
    faceCentroids[f * 3 + 1] = (c[1] - aabb.min[1]) / scale;
    faceCentroids[f * 3 + 2] = (c[2] - aabb.min[2]) / scale;
    faceNormals[f * 3] = n[0];
    faceNormals[f * 3 + 1] = n[1];
    faceNormals[f * 3 + 2] = n[2];
    sampleMappings.push(
      Object.freeze({
        sampleIndex: f,
        faceIndex: f,
        barycentric: Object.freeze([1 / 3, 1 / 3, 1 / 3] as const)
      })
    );
  }
  return Object.freeze({
    version: PREPROCESSING_VERSION,
    sourceFingerprint: working.fingerprint || fingerprintMesh(working.positions, working.indices),
    sourceRevision: working.revision,
    objectId: working.objectId,
    vertexCount: stats.vertexCount,
    faceCount: stats.triangleCount,
    aabb,
    scale,
    sampleMappings: Object.freeze(sampleMappings),
    faceCentroids,
    faceNormals,
    warnings: Object.freeze([...quality.warnings]),
    timingMs: performance.now() - started
  });
};
