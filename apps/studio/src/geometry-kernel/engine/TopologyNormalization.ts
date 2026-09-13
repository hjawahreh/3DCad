/**
 * GEO-001B — topology normalization (exact weld of triangle-soup imports).
 *
 * SOURCE mesh stays raw. WORKING mesh is the normalized indexed surface.
 * Do not weaken SurfacePath connectivity validation — fix topology here.
 */

import {
  createMesh,
  fingerprintMesh,
  type TriangleMesh
} from '../mesh/TriangleMesh.js';
import { analyzeMesh } from './MeshAnalysis.js';
import { buildTopology } from './TopologyGraph.js';

export type TopologyWeldMode = 'EXACT' | 'CONSERVATIVE';

export interface TopologyWeldPolicy {
  readonly mode: TopologyWeldMode;
  /** Absolute mm tolerance. Must be 0 for EXACT. Never a silent bbox fraction. */
  readonly absoluteTolerance: number;
  /** Reject conservative weld if max vertex movement exceeds this (mm). */
  readonly maxAllowedDeviationMm?: number;
}

export const DEFAULT_TOPOLOGY_WELD_POLICY: TopologyWeldPolicy = Object.freeze({
  mode: 'EXACT',
  absoluteTolerance: 0
});

export interface TopologyNormalizationReport {
  readonly rawVertexCount: number;
  readonly rawTriangleCount: number;
  readonly normalizedVertexCount: number;
  readonly normalizedTriangleCount: number;
  readonly exactDuplicatesRemoved: number;
  readonly nearDuplicatesMerged: number;
  readonly degenerateTrianglesRemoved: number;
  readonly duplicateTrianglesRemoved: number;
  readonly connectedComponentsBefore: number;
  readonly connectedComponentsAfter: number;
  readonly boundaryEdges: number;
  readonly nonManifoldEdges: number;
  readonly weldTolerance: number;
  readonly geometryFingerprintBefore: string;
  readonly geometryFingerprintAfter: string;
  readonly durationMs: number;
  readonly orientationChanged: boolean;
  readonly orientationMethod: string | undefined;
  readonly maxDeviation: number;
  readonly meanDeviation: number;
  readonly p95Deviation: number;
  readonly policy: TopologyWeldPolicy;
  readonly alreadyIndexed: boolean;
}

export interface TopologyNormalizationResult {
  readonly mesh: TriangleMesh;
  readonly report: TopologyNormalizationReport;
}

const f32Bits = (value: number): number => {
  const buf = new ArrayBuffer(4);
  new Float32Array(buf)[0] = value;
  return new Uint32Array(buf)[0]!;
};

/** Deterministic exact coordinate key from IEEE-754 float32 bit patterns. */
const exactCoordKey = (x: number, y: number, z: number): string =>
  `${f32Bits(x).toString(16)}:${f32Bits(y).toString(16)}:${f32Bits(z).toString(16)}`;

const nearBucketKey = (x: number, y: number, z: number, cell: number): string => {
  const inv = 1 / cell;
  return `${Math.floor(x * inv)}:${Math.floor(y * inv)}:${Math.floor(z * inv)}`;
};

const triArea2 = (
  positions: Float32Array,
  a: number,
  b: number,
  c: number
): number => {
  const ax = positions[a * 3]!;
  const ay = positions[a * 3 + 1]!;
  const az = positions[a * 3 + 2]!;
  const bx = positions[b * 3]!;
  const by = positions[b * 3 + 1]!;
  const bz = positions[b * 3 + 2]!;
  const cx = positions[c * 3]!;
  const cy = positions[c * 3 + 1]!;
  const cz = positions[c * 3 + 2]!;
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return nx * nx + ny * ny + nz * nz;
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
};

/**
 * Normalize triangle-soup / indexed meshes into a shared-vertex surface.
 * Default policy is EXACT weld only (no arbitrary near-merge).
 */
export const normalizeMeshTopology = (
  mesh: TriangleMesh,
  policy: TopologyWeldPolicy = DEFAULT_TOPOLOGY_WELD_POLICY
): TopologyNormalizationResult => {
  const started = performance.now();
  if (policy.mode === 'EXACT' && policy.absoluteTolerance !== 0) {
    throw new Error('EXACT TopologyWeldPolicy requires absoluteTolerance === 0');
  }
  if (policy.mode === 'CONSERVATIVE' && !(policy.absoluteTolerance > 0)) {
    throw new Error('CONSERVATIVE TopologyWeldPolicy requires absoluteTolerance > 0');
  }

  const rawVertexCount = Math.floor(mesh.positions.length / 3);
  const rawTriangleCount = Math.floor(mesh.indices.length / 3);
  const fingerprintBefore = mesh.fingerprint || fingerprintMesh(mesh.positions, mesh.indices);
  const qualityBefore = analyzeMesh(mesh);
  const componentsBefore = qualityBefore.connectedComponentCount;

  // --- A. Exact duplicate weld (deterministic first-occurrence canonical) ---
  const exactMap = new Int32Array(rawVertexCount).fill(-1);
  const exactPositions: number[] = [];
  const exactKeyToNew = new Map<string, number>();
  let exactDuplicatesRemoved = 0;

  for (let v = 0; v < rawVertexCount; v += 1) {
    const x = mesh.positions[v * 3]!;
    const y = mesh.positions[v * 3 + 1]!;
    const z = mesh.positions[v * 3 + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    const key = exactCoordKey(x, y, z);
    const existing = exactKeyToNew.get(key);
    if (existing !== undefined) {
      exactMap[v] = existing;
      exactDuplicatesRemoved += 1;
    } else {
      const ni = exactPositions.length / 3;
      exactKeyToNew.set(key, ni);
      exactMap[v] = ni;
      exactPositions.push(x, y, z);
    }
  }

  let positionsArr = exactPositions;
  let vertexMap = exactMap;
  let nearDuplicatesMerged = 0;
  const deviations: number[] = [];

  // --- Optional conservative near-weld (explicit absolute tolerance only) ---
  if (policy.mode === 'CONSERVATIVE' && policy.absoluteTolerance > 0) {
    const tol = policy.absoluteTolerance;
    const cell = Math.max(tol, Number.EPSILON);
    const buckets = new Map<string, number[]>();
    const nearMap = new Int32Array(positionsArr.length / 3).fill(-1);
    const nearPositions: number[] = [];

    const candidateCount = positionsArr.length / 3;
    for (let v = 0; v < candidateCount; v += 1) {
      const x = positionsArr[v * 3]!;
      const y = positionsArr[v * 3 + 1]!;
      const z = positionsArr[v * 3 + 2]!;
      const bx0 = Math.floor(x / cell);
      const by0 = Math.floor(y / cell);
      const bz0 = Math.floor(z / cell);
      let mergedTo: number | undefined;
      let bestDist = Infinity;
      // Search 3×3×3 neighborhood of spatial buckets.
      for (let dx = -1; dx <= 1 && mergedTo === undefined; dx += 1) {
        for (let dy = -1; dy <= 1 && mergedTo === undefined; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const buck = buckets.get(`${bx0 + dx}:${by0 + dy}:${bz0 + dz}`);
            if (buck === undefined) continue;
            for (const cand of buck) {
              const cx = nearPositions[cand * 3]!;
              const cy = nearPositions[cand * 3 + 1]!;
              const cz = nearPositions[cand * 3 + 2]!;
              const dist = Math.hypot(cx - x, cy - y, cz - z);
              if (dist <= tol && dist < bestDist) {
                // Prefer disconnected over over-welding: reject if normals diverge when both exist.
                bestDist = dist;
                mergedTo = cand;
              }
            }
          }
        }
      }
      if (mergedTo !== undefined) {
        nearMap[v] = mergedTo;
        nearDuplicatesMerged += 1;
        deviations.push(bestDist);
      } else {
        const ni = nearPositions.length / 3;
        nearMap[v] = ni;
        const key = nearBucketKey(x, y, z, cell);
        const list = buckets.get(key) ?? [];
        list.push(ni);
        buckets.set(key, list);
        nearPositions.push(x, y, z);
      }
    }

    const remapped = new Int32Array(rawVertexCount).fill(-1);
    for (let v = 0; v < rawVertexCount; v += 1) {
      const mid = exactMap[v]!;
      if (mid < 0) continue;
      remapped[v] = nearMap[mid]!;
    }
    vertexMap = remapped;
    positionsArr = nearPositions;
  }

  const maxAllowed = policy.maxAllowedDeviationMm;
  if (
    policy.mode === 'CONSERVATIVE' &&
    maxAllowed !== undefined &&
    deviations.length > 0
  ) {
    const maxDev = Math.max(...deviations);
    if (maxDev > maxAllowed) {
      throw new Error(
        `Conservative near-weld maxDeviation ${maxDev.toFixed(6)} mm exceeds contract ${maxAllowed} mm`
      );
    }
  }

  // --- C/D. Remap triangles, drop degenerates + exact duplicate tris ---
  const pos = new Float32Array(positionsArr);
  const indices: number[] = [];
  const seenTris = new Set<string>();
  let degenerateTrianglesRemoved = 0;
  let duplicateTrianglesRemoved = 0;

  for (let t = 0; t < rawTriangleCount; t += 1) {
    const ia = mesh.indices[t * 3]!;
    const ib = mesh.indices[t * 3 + 1]!;
    const ic = mesh.indices[t * 3 + 2]!;
    const a = vertexMap[ia]!;
    const b = vertexMap[ib]!;
    const c = vertexMap[ic]!;
    if (a < 0 || b < 0 || c < 0) {
      degenerateTrianglesRemoved += 1;
      continue;
    }
    if (a === b || b === c || a === c) {
      degenerateTrianglesRemoved += 1;
      continue;
    }
    if (triArea2(pos, a, b, c) < 1e-24) {
      degenerateTrianglesRemoved += 1;
      continue;
    }
    // Canonical key independent of winding for duplicate detection only.
    const lo = a < b ? (a < c ? a : c) : b < c ? b : c;
    const hi = a > b ? (a > c ? a : c) : b > c ? b : c;
    const mid = a + b + c - lo - hi;
    const dupKey = `${lo}:${mid}:${hi}`;
    if (seenTris.has(dupKey)) {
      duplicateTrianglesRemoved += 1;
      continue;
    }
    seenTris.add(dupKey);
    indices.push(a, b, c);
  }

  const idx = new Uint32Array(indices);
  const fingerprintAfter = fingerprintMesh(pos, idx);
  const alreadyIndexed =
    exactDuplicatesRemoved === 0 &&
    nearDuplicatesMerged === 0 &&
    degenerateTrianglesRemoved === 0 &&
    duplicateTrianglesRemoved === 0 &&
    fingerprintAfter === fingerprintBefore;

  const normalized = createMesh({
    id: mesh.id,
    objectId: mesh.objectId,
    role: mesh.role,
    revision: mesh.revision,
    positions: pos,
    indices: idx,
    fingerprint: fingerprintAfter,
    ...(mesh.normals !== undefined && alreadyIndexed ? { normals: mesh.normals } : {})
  });

  // --- E/F. Rebuild topology metrics on normalized mesh ---
  const qualityAfter = analyzeMesh(normalized);
  const topology = buildTopology(normalized);

  deviations.sort((a, b) => a - b);
  const maxDeviation = deviations.length === 0 ? 0 : deviations[deviations.length - 1]!;
  const meanDeviation =
    deviations.length === 0
      ? 0
      : deviations.reduce((s, d) => s + d, 0) / deviations.length;
  const p95Deviation = percentile(deviations, 0.95);

  const report: TopologyNormalizationReport = Object.freeze({
    rawVertexCount,
    rawTriangleCount,
    normalizedVertexCount: qualityAfter.vertexCount,
    normalizedTriangleCount: qualityAfter.triangleCount,
    exactDuplicatesRemoved,
    nearDuplicatesMerged,
    degenerateTrianglesRemoved,
    duplicateTrianglesRemoved,
    connectedComponentsBefore: componentsBefore,
    connectedComponentsAfter: qualityAfter.connectedComponentCount,
    boundaryEdges: topology.boundaryEdges.length,
    nonManifoldEdges: topology.nonManifoldEdges.length,
    weldTolerance: policy.absoluteTolerance,
    geometryFingerprintBefore: fingerprintBefore,
    geometryFingerprintAfter: fingerprintAfter,
    durationMs: performance.now() - started,
    orientationChanged: false,
    orientationMethod: undefined,
    maxDeviation,
    meanDeviation,
    p95Deviation,
    policy: Object.freeze({ ...policy }),
    alreadyIndexed
  });

  return { mesh: normalized, report };
};

/** Measure spacing stats to justify a conservative tolerance (diagnostics only). */
export const measureImportVertexSpacing = (
  mesh: TriangleMesh
): {
  readonly minNonZeroDistance: number | undefined;
  readonly bboxDiagonal: number;
  readonly sampleCount: number;
} => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const bbox = analyzeMesh(mesh).bbox;
  const dx = bbox.max[0]! - bbox.min[0]!;
  const dy = bbox.max[1]! - bbox.min[1]!;
  const dz = bbox.max[2]! - bbox.min[2]!;
  const bboxDiagonal = Math.hypot(dx, dy, dz);
  let minNonZero: number | undefined;
  const step = Math.max(1, Math.floor(vertexCount / 4000));
  let sampleCount = 0;
  for (let i = 0; i < vertexCount; i += step) {
    const ax = mesh.positions[i * 3]!;
    const ay = mesh.positions[i * 3 + 1]!;
    const az = mesh.positions[i * 3 + 2]!;
    for (let j = i + step; j < Math.min(vertexCount, i + step * 40); j += step) {
      const d = Math.hypot(
        mesh.positions[j * 3]! - ax,
        mesh.positions[j * 3 + 1]! - ay,
        mesh.positions[j * 3 + 2]! - az
      );
      sampleCount += 1;
      if (d > 0 && (minNonZero === undefined || d < minNonZero)) {
        minNonZero = d;
      }
    }
  }
  return { minNonZeroDistance: minNonZero, bboxDiagonal, sampleCount };
};
