/**
 * GEO-001D — Boundary-driven clinical base construction (V2).
 *
 * Consumes the open dental boundary on the CURRENT WORKING (trimmed) mesh.
 * Does NOT use AABB perimeter / viewport rectangle / arbitrary world plane as
 * the clinical base border.
 */

import {
  createMesh,
  fingerprintMesh,
  type MeshRole,
  type TriangleMesh
} from '../mesh/TriangleMesh.js';
import { buildTopology, extractBoundaryLoops } from './TopologyGraph.js';
import { analyzeMesh } from './MeshAnalysis.js';
import type { BoundaryLoopCandidate } from './types.js';

export interface AnalyzedBoundaryLoop {
  readonly candidate: BoundaryLoopCandidate;
  readonly pointCount: number;
  readonly perimeter: number;
  readonly enclosedArea: number;
  readonly centroid: readonly [number, number, number];
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly averageNormal: readonly [number, number, number];
  readonly planeFitResidual: number;
  readonly maxPlaneDistance: number;
  readonly meanPlaneDistance: number;
  readonly p95PlaneDistance: number;
}

export interface BaseQualityReport {
  readonly inputFingerprint: string;
  readonly outputFingerprint: string;
  readonly boundaryPointCount: number;
  readonly boundaryLength: number;
  readonly planeFitResidual: number;
  readonly maxPlaneDistance: number;
  readonly meanPlaneDistance: number;
  readonly p95PlaneDistance: number;
  readonly baseArea: number;
  readonly baseVolumeEstimate: number;
  readonly thicknessStats: {
    readonly min: number;
    readonly max: number;
    readonly mean: number;
  };
  readonly componentCount: number;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly degenerateTriangleCount: number;
  readonly selfIntersection: boolean;
  readonly watertight: boolean;
  readonly manifold: boolean;
  readonly boundaryMatch: {
    readonly meanDistance: number;
    readonly maxDistance: number;
    readonly perimeterRatio: number;
    readonly passed: boolean;
    readonly toleranceMm: number;
  };
  readonly slabDetection: {
    readonly detected: boolean;
    readonly aabbPerimeterRatio: number;
    readonly reason: string;
  };
  readonly diagonalBridgeDetection: {
    readonly suspiciousFaceCount: number;
    readonly suspiciousFaceRatio: number;
    readonly rejected: boolean;
  };
  readonly durationMs: number;
  readonly stageTimingsMs: Readonly<Record<string, number>>;
  readonly blockingFailures: readonly string[];
}

export interface ClinicalBaseConstructionInput {
  readonly mesh: TriangleMesh;
  readonly strategy: 'plane' | 'surface' | 'offset';
  readonly height: number;
  readonly thickness: number;
  readonly offset: number;
  readonly clinicalBaseNormal?: readonly [number, number, number];
  readonly preferClinicalFrame?: boolean;
  readonly role?: MeshRole;
  readonly revision?: number;
  readonly id?: number;
  readonly maxBoundarySamples?: number;
}

export type ClinicalBaseConstructionResult =
  | {
      readonly ok: true;
      readonly mesh: TriangleMesh;
      readonly selectedBoundary: BoundaryLoopCandidate;
      readonly analyzed: AnalyzedBoundaryLoop;
      readonly addedTriangles: number;
      readonly quality: BaseQualityReport;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly quality?: BaseQualityReport;
      readonly selectedBoundary?: BoundaryLoopCandidate;
      readonly warnings: readonly string[];
    };

const dist3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

const vertexPoint = (
  mesh: TriangleMesh,
  vi: number
): readonly [number, number, number] => [
  mesh.positions[vi * 3]!,
  mesh.positions[vi * 3 + 1]!,
  mesh.positions[vi * 3 + 2]!
];

const newellNormal = (
  points: readonly (readonly [number, number, number])[]
): readonly [number, number, number] => {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
};

const orthonormalBasis = (
  normal: readonly [number, number, number]
): {
  readonly u: readonly [number, number, number];
  readonly v: readonly [number, number, number];
} => {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  const helper: readonly [number, number, number] =
    ax < ay && ax < az ? [1, 0, 0] : ay < az ? [0, 1, 0] : [0, 0, 1];
  let ux = normal[1] * helper[2] - normal[2] * helper[1];
  let uy = normal[2] * helper[0] - normal[0] * helper[2];
  let uz = normal[0] * helper[1] - normal[1] * helper[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = normal[1] * uz - normal[2] * uy;
  const vy = normal[2] * ux - normal[0] * uz;
  const vz = normal[0] * uy - normal[1] * ux;
  return {
    u: [ux, uy, uz],
    v: [vx, vy, vz]
  };
};

const projectToPlaneUv = (
  point: readonly [number, number, number],
  origin: readonly [number, number, number],
  u: readonly [number, number, number],
  v: readonly [number, number, number]
): { readonly x: number; readonly y: number } => {
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  const dz = point[2] - origin[2];
  return { x: dx * u[0] + dy * u[1] + dz * u[2], y: dx * v[0] + dy * v[1] + dz * v[2] };
};

const planeDistance = (
  point: readonly [number, number, number],
  origin: readonly [number, number, number],
  normal: readonly [number, number, number]
): number =>
  (point[0] - origin[0]) * normal[0] +
  (point[1] - origin[1]) * normal[1] +
  (point[2] - origin[2]) * normal[2];

const cleanLoopIndices = (
  mesh: TriangleMesh,
  indices: readonly number[]
): number[] => {
  const out: number[] = [];
  for (const vi of indices) {
    if (!Number.isFinite(vi) || vi < 0 || vi >= mesh.positions.length / 3) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && dist3(vertexPoint(mesh, prev), vertexPoint(mesh, vi)) < 1e-7) {
      continue;
    }
    out.push(vi);
  }
  if (out.length >= 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (dist3(vertexPoint(mesh, first), vertexPoint(mesh, last)) < 1e-7) {
      out.pop();
    }
  }
  return out;
};

/**
 * Shape-preserving boundary resample. Prefer keeping all samples.
 * Only simplify when over maxSamples, and reject if perimeter collapses.
 */
const resampleBoundaryIndices = (
  mesh: TriangleMesh,
  indices: readonly number[],
  maxSamples: number
): { readonly indices: number[]; readonly warning?: string } => {
  if (indices.length <= maxSamples) return { indices: [...indices] };
  // Even stride is forbidden for clinical arches — it chords concave borders into
  // AABB-like shortcuts. Use adaptive keep: dense enough that max edge ≤ 2× median.
  const points = indices.map((vi) => vertexPoint(mesh, vi));
  const edgeLens: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    edgeLens.push(dist3(points[i]!, points[(i + 1) % points.length]!));
  }
  const sorted = [...edgeLens].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const maxEdge = Math.max(median * 2.5, median + 1e-6);
  const out: number[] = [indices[0]!];
  let acc = 0;
  for (let i = 1; i < indices.length; i += 1) {
    acc += edgeLens[i - 1]!;
    const remaining = indices.length - i;
    const room = maxSamples - out.length - remaining;
    if (acc >= maxEdge || room <= 0) {
      out.push(indices[i]!);
      acc = 0;
    }
  }
  if (out[out.length - 1] !== indices[indices.length - 1]) {
    out.push(indices[indices.length - 1]!);
  }
  // Drop closing duplicate
  if (out.length >= 3 && out[0] === out[out.length - 1]) out.pop();
  if (out.length > maxSamples) {
    // Last resort: keep first maxSamples uniformly but warn — caller may fail match.
    const forced = subsampleIndices(indices, maxSamples);
    return {
      indices: forced,
      warning: `Boundary resampled ${String(indices.length)}→${String(forced.length)} (may affect perimeter)`
    };
  }
  if (out.length < indices.length) {
    return {
      indices: out.length >= 3 ? out : [...indices],
      warning: `Boundary lightly densified-reduced ${String(indices.length)}→${String(out.length)}`
    };
  }
  return { indices: out.length >= 3 ? out : [...indices] };
};

const subsampleIndices = (indices: readonly number[], maxSamples: number): number[] => {
  if (indices.length <= maxSamples) return [...indices];
  const out: number[] = [];
  for (let i = 0; i < maxSamples; i += 1) {
    const idx = Math.floor((i * indices.length) / maxSamples);
    const v = indices[idx]!;
    if (out.length === 0 || out[out.length - 1] !== v) out.push(v);
  }
  if (out.length >= 3 && out[0] === out[out.length - 1]) out.pop();
  return out.length >= 3 ? out : [...indices].slice(0, Math.min(indices.length, maxSamples));
};

export const analyzeBoundaryLoop = (
  mesh: TriangleMesh,
  candidate: BoundaryLoopCandidate
): AnalyzedBoundaryLoop => {
  const cleaned = cleanLoopIndices(mesh, candidate.vertexIndices);
  const points = cleaned.map((vi) => vertexPoint(mesh, vi));
  const normal = newellNormal(points);
  const centroid = candidate.centroid;
  const distances = points.map((p) => Math.abs(planeDistance(p, centroid, normal)));
  const sorted = [...distances].sort((a, b) => a - b);
  const mean = distances.reduce((a, b) => a + b, 0) / Math.max(1, distances.length);
  const residual = Math.sqrt(
    distances.reduce((a, d) => a + d * d, 0) / Math.max(1, distances.length)
  );
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    minZ = Math.min(minZ, p[2]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
    maxZ = Math.max(maxZ, p[2]);
  }
  const basis = orthonormalBasis(normal);
  let area = 0;
  const uv = points.map((p) => projectToPlaneUv(p, centroid, basis.u, basis.v));
  for (let i = 0; i < uv.length; i += 1) {
    const a = uv[i]!;
    const b = uv[(i + 1) % uv.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  area = Math.abs(area) * 0.5;
  return {
    candidate: {
      ...candidate,
      vertexIndices: cleaned
    },
    pointCount: cleaned.length,
    perimeter: candidate.perimeter,
    enclosedArea: area,
    centroid,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    averageNormal: normal,
    planeFitResidual: residual,
    maxPlaneDistance: sorted[sorted.length - 1] ?? 0,
    meanPlaneDistance: mean,
    p95PlaneDistance: p95
  };
};

/**
 * Select the clinical trim/open rim — not AABB, not automatic smallest loop.
 * Prefer large perimeter + enclosed area, clinically oriented, non-noise.
 */
export const selectClinicalBaseBoundary = (
  mesh: TriangleMesh,
  clinicalNormal?: readonly [number, number, number]
):
  | { readonly ok: true; readonly analyzed: AnalyzedBoundaryLoop; readonly all: readonly AnalyzedBoundaryLoop[] }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly all: readonly AnalyzedBoundaryLoop[] } => {
  const candidates = extractBoundaryLoops(mesh);
  if (candidates.length === 0) {
    return {
      ok: false,
      code: 'NO_BOUNDARY',
      message: 'No open boundary loops found for base generation',
      all: []
    };
  }
  const all = candidates.map((c) => analyzeBoundaryLoop(mesh, c));
  // Reject tiny artifact loops (< 5 mm perimeter or < 8 points).
  const viable = all.filter((a) => a.pointCount >= 8 && a.perimeter >= 5 && a.enclosedArea > 1e-3);
  const pool = viable.length > 0 ? viable : all.filter((a) => a.pointCount >= 3);
  if (pool.length === 0) {
    return {
      ok: false,
      code: 'INVALID_BOUNDARY',
      message: 'No trustworthy clinical boundary could be identified',
      all
    };
  }
  let best = pool[0]!;
  let bestScore = -Infinity;
  for (const a of pool) {
    let score = a.perimeter * 0.4 + a.enclosedArea * 0.6;
    if (clinicalNormal !== undefined) {
      const align = Math.abs(
        a.averageNormal[0] * clinicalNormal[0] +
          a.averageNormal[1] * clinicalNormal[1] +
          a.averageNormal[2] * clinicalNormal[2]
      );
      score += align * a.perimeter * 0.15;
      // Prefer loops whose centroid is more inferior along clinical normal.
      const inferior = -(
        a.centroid[0] * clinicalNormal[0] +
        a.centroid[1] * clinicalNormal[1] +
        a.centroid[2] * clinicalNormal[2]
      );
      score += inferior * 0.05;
    }
    // Penalize high plane residual relative to perimeter (noisy fragments).
    score -= a.planeFitResidual * 2;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  // Guard: primary must dominate tiny noise (avoid picking a triangle artifact).
  const maxPerim = Math.max(...all.map((a) => a.perimeter));
  if (best.perimeter < maxPerim * 0.35 && maxPerim > 20) {
    const larger = pool.find((a) => a.perimeter >= maxPerim * 0.9) ?? best;
    best = larger;
  }
  if (best.pointCount < 3 || best.perimeter < 1e-3) {
    return {
      ok: false,
      code: 'INVALID_BOUNDARY',
      message: 'Extracted dental border is not a valid closed loop',
      all
    };
  }
  return { ok: true, analyzed: best, all };
};

/** Centroid fan in UV — no non-adjacent boundary diagonals. */
const centroidFanUv = (
  uv: readonly { readonly x: number; readonly y: number }[]
): { readonly tris: number[][]; readonly centroidUv: { x: number; y: number } } | undefined => {
  if (uv.length < 3) return undefined;
  let cx = 0;
  let cy = 0;
  for (const p of uv) {
    cx += p.x;
    cy += p.y;
  }
  cx /= uv.length;
  cy /= uv.length;
  const inside = pointInPolygonUv(uv, cx, cy);
  if (!inside) {
    // CLN-WORKFLOW-002: lower-arch borders are often non-convex — try an interior seed.
    const seed = findInteriorUv(uv);
    if (seed === undefined) return undefined;
    cx = seed.x;
    cy = seed.y;
  }
  const tris: number[][] = [];
  for (let i = 0; i < uv.length; i += 1) {
    tris.push([uv.length, i, (i + 1) % uv.length]); // index uv.length = centroid sentinel
  }
  return { tris, centroidUv: { x: cx, y: cy } };
};

const pointInPolygonUv = (
  uv: readonly { readonly x: number; readonly y: number }[],
  x: number,
  y: number
): boolean => {
  let inside = false;
  for (let i = 0, j = uv.length - 1; i < uv.length; j = i++) {
    const pi = uv[i]!;
    const pj = uv[j]!;
    if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y + 1e-30) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
};

/** Find a point strictly inside a (possibly concave) UV polygon. */
const findInteriorUv = (
  uv: readonly { readonly x: number; readonly y: number }[]
): { x: number; y: number } | undefined => {
  if (uv.length < 3) return undefined;
  // Midpoints of consecutive edge pairs → offset slightly toward polygon average.
  let ax = 0;
  let ay = 0;
  for (const p of uv) {
    ax += p.x;
    ay += p.y;
  }
  ax /= uv.length;
  ay /= uv.length;
  for (let i = 0; i < uv.length; i += 1) {
    const a = uv[i]!;
    const b = uv[(i + 1) % uv.length]!;
    const c = uv[(i + 2) % uv.length]!;
    const mx = (a.x + b.x + c.x) / 3;
    const my = (a.y + b.y + c.y) / 3;
    // Nudge toward mean to escape the boundary.
    const sx = mx * 0.85 + ax * 0.15;
    const sy = my * 0.85 + ay * 0.15;
    if (pointInPolygonUv(uv, sx, sy)) return { x: sx, y: sy };
    if (pointInPolygonUv(uv, mx, my)) return { x: mx, y: my };
  }
  // Grid search in AABB
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of uv) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  for (let gy = 0; gy <= 12; gy += 1) {
    for (let gx = 0; gx <= 12; gx += 1) {
      const x = minX + ((maxX - minX) * (gx + 0.5)) / 13;
      const y = minY + ((maxY - minY) * (gy + 0.5)) / 13;
      if (pointInPolygonUv(uv, x, y)) return { x, y };
    }
  }
  return undefined;
};

/** Robust ear-clip in UV (concave fallback). */
const earClipUv = (
  uv: readonly { readonly x: number; readonly y: number }[]
): number[][] | undefined => {
  if (uv.length < 3) return undefined;
  const tryClip = (ordered: number[]): number[][] | undefined => {
    const tris: number[][] = [];
    const remaining = [...ordered];
    let guard = 0;
    while (remaining.length > 3 && guard < ordered.length * ordered.length + 64) {
      guard += 1;
      let clipped = false;
      for (let i = 0; i < remaining.length; i += 1) {
        const i0 = remaining[(i + remaining.length - 1) % remaining.length]!;
        const i1 = remaining[i]!;
        const i2 = remaining[(i + 1) % remaining.length]!;
        const a = uv[i0]!;
        const b = uv[i1]!;
        const c = uv[i2]!;
        const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (cross <= 1e-14) continue;
        let hasPoint = false;
        for (let k = 0; k < remaining.length; k += 1) {
          const rk = remaining[k]!;
          if (rk === i0 || rk === i1 || rk === i2) continue;
          const p = uv[rk]!;
          const d1 = (p.x - b.x) * (a.y - b.y) - (p.y - b.y) * (a.x - b.x);
          const d2 = (p.x - c.x) * (b.y - c.y) - (p.y - c.y) * (b.x - c.x);
          const d3 = (p.x - a.x) * (c.y - a.y) - (p.y - a.y) * (c.x - a.x);
          const hasNeg = d1 < -1e-14 || d2 < -1e-14 || d3 < -1e-14;
          const hasPos = d1 > 1e-14 || d2 > 1e-14 || d3 > 1e-14;
          if (!(hasNeg && hasPos)) {
            hasPoint = true;
            break;
          }
        }
        if (hasPoint) continue;
        tris.push([i0, i1, i2]);
        remaining.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) return undefined;
    }
    if (remaining.length === 3) {
      tris.push([remaining[0]!, remaining[1]!, remaining[2]!]);
    }
    return remaining.length <= 3 && tris.length > 0 ? tris : undefined;
  };

  const idx = uv.map((_, i) => i);
  let area = 0;
  for (let i = 0; i < idx.length; i += 1) {
    const a = uv[idx[i]!]!;
    const b = uv[idx[(i + 1) % idx.length]!]!;
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 0) idx.reverse();
  const forward = tryClip(idx);
  if (forward !== undefined) return forward;
  // Retry opposite winding for noisy dental borders.
  idx.reverse();
  return tryClip(idx);
};

const countEdgeUses = (indices: Uint32Array): {
  boundary: number;
  nonManifold: number;
} => {
  const use = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const triCount = Math.floor(indices.length / 3);
  for (let t = 0; t < triCount; t += 1) {
    const i0 = indices[t * 3]!;
    const i1 = indices[t * 3 + 1]!;
    const i2 = indices[t * 3 + 2]!;
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ] as const) {
      const k = key(a, b);
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let boundary = 0;
  let nonManifold = 0;
  for (const c of use.values()) {
    if (c === 1) boundary += 1;
    if (c > 2) nonManifold += 1;
  }
  return { boundary, nonManifold };
};

const countDegenerate = (positions: Float32Array, indices: Uint32Array): number => {
  let n = 0;
  const triCount = Math.floor(indices.length / 3);
  for (let t = 0; t < triCount; t += 1) {
    const i0 = indices[t * 3]!;
    const i1 = indices[t * 3 + 1]!;
    const i2 = indices[t * 3 + 2]!;
    const ax = positions[i0 * 3]!;
    const ay = positions[i0 * 3 + 1]!;
    const az = positions[i0 * 3 + 2]!;
    const bx = positions[i1 * 3]!;
    const by = positions[i1 * 3 + 1]!;
    const bz = positions[i1 * 3 + 2]!;
    const cx = positions[i2 * 3]!;
    const cy = positions[i2 * 3 + 1]!;
    const cz = positions[i2 * 3 + 2]!;
    const ab = Math.hypot(bx - ax, by - ay, bz - az);
    const bc = Math.hypot(cx - bx, cy - by, cz - bz);
    const ca = Math.hypot(ax - cx, ay - cy, az - cz);
    const s = (ab + bc + ca) * 0.5;
    const area2 = Math.max(0, s * (s - ab) * (s - bc) * (s - ca));
    if (!(area2 > 1e-16)) n += 1;
  }
  return n;
};

const detectDiagonalBridges = (
  positions: Float32Array,
  indices: Uint32Array,
  archWidth: number,
  centroid: readonly [number, number, number],
  baseTriStart: number,
  originalVertexCount: number
): { count: number; ratio: number } => {
  const threshold = Math.max(8, archWidth * 0.45);
  const triCount = Math.floor(indices.length / 3);
  let suspicious = 0;
  let inspected = 0;
  for (let t = baseTriStart; t < triCount; t += 1) {
    const i0 = indices[t * 3]!;
    const i1 = indices[t * 3 + 1]!;
    const i2 = indices[t * 3 + 2]!;
    // Only flag fills that use exclusively original mesh vertices (cross-arch chords).
    // Walls / centroid fans introduce new vertices and are not cross-arch bridges.
    if (i0 >= originalVertexCount || i1 >= originalVertexCount || i2 >= originalVertexCount) {
      continue;
    }
    inspected += 1;
    const pts = [i0, i1, i2].map((vi) => [
      positions[vi * 3]!,
      positions[vi * 3 + 1]!,
      positions[vi * 3 + 2]!
    ] as const);
    let maxEdge = 0;
    for (let e = 0; e < 3; e += 1) {
      const a = pts[e]!;
      const b = pts[(e + 1) % 3]!;
      maxEdge = Math.max(maxEdge, dist3(a, b));
    }
    if (maxEdge < threshold) continue;
    const tcx = (pts[0]![0] + pts[1]![0] + pts[2]![0]) / 3;
    const tcy = (pts[0]![1] + pts[1]![1] + pts[2]![1]) / 3;
    const tcz = (pts[0]![2] + pts[1]![2] + pts[2]![2]) / 3;
    const toCenter = Math.hypot(tcx - centroid[0], tcy - centroid[1], tcz - centroid[2]);
    if (toCenter < archWidth * 0.35) {
      suspicious += 1;
    }
  }
  return {
    count: suspicious,
    ratio: inspected > 0 ? suspicious / inspected : 0
  };
};

const aabbRectanglePerimeter = (
  bounds: AnalyzedBoundaryLoop['bounds'],
  normal: readonly [number, number, number]
): number => {
  const sx = bounds.max[0] - bounds.min[0];
  const sy = bounds.max[1] - bounds.min[1];
  const sz = bounds.max[2] - bounds.min[2];
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  // Rectangle perimeter in the plane orthogonal to dominant normal axis.
  if (ax >= ay && ax >= az) return 2 * (sy + sz);
  if (ay >= ax && ay >= az) return 2 * (sx + sz);
  return 2 * (sx + sy);
};

/**
 * CLN-WORKFLOW-002A — keep only the largest face-connected component.
 * Real lower scans can carry a tiny disconnected scrap (e.g. one triangle /
 * 3 boundary edges) that survives clinical-rim closure and falsely fails
 * watertight. Dropping non-dominant scraps is not a triangulation redesign.
 */
const keepLargestFaceComponent = (
  mesh: TriangleMesh
): { readonly mesh: TriangleMesh; readonly droppedFaces: number; readonly components: number } => {
  const topology = buildTopology(mesh);
  if (topology.componentCount <= 1) {
    return { mesh, droppedFaces: 0, components: topology.componentCount };
  }
  const counts = new Array<number>(topology.componentCount).fill(0);
  for (let f = 0; f < topology.faceCount; f += 1) {
    const c = topology.components[f]!;
    if (c >= 0) counts[c]! += 1;
  }
  let best = 0;
  for (let c = 1; c < counts.length; c += 1) {
    if (counts[c]! > counts[best]!) best = c;
  }
  const keepFaces: number[] = [];
  for (let f = 0; f < topology.faceCount; f += 1) {
    if (topology.components[f] === best) keepFaces.push(f);
  }
  if (keepFaces.length === topology.faceCount) {
    return { mesh, droppedFaces: 0, components: topology.componentCount };
  }
  const used = new Int32Array(Math.floor(mesh.positions.length / 3)).fill(-1);
  const positions: number[] = [];
  const indices: number[] = [];
  const mapVertex = (vi: number): number => {
    const existing = used[vi]!;
    if (existing >= 0) return existing;
    const ni = positions.length / 3;
    used[vi] = ni;
    positions.push(
      mesh.positions[vi * 3]!,
      mesh.positions[vi * 3 + 1]!,
      mesh.positions[vi * 3 + 2]!
    );
    return ni;
  };
  for (const f of keepFaces) {
    indices.push(
      mapVertex(mesh.indices[f * 3]!),
      mapVertex(mesh.indices[f * 3 + 1]!),
      mapVertex(mesh.indices[f * 3 + 2]!)
    );
  }
  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return {
    mesh: createMesh({
      id: mesh.id,
      objectId: mesh.objectId,
      role: mesh.role,
      revision: mesh.revision,
      positions: pos,
      indices: idx,
      fingerprint: fingerprintMesh(pos, idx)
    }),
    droppedFaces: topology.faceCount - keepFaces.length,
    components: topology.componentCount
  };
};

export const constructClinicalBase = (
  input: ClinicalBaseConstructionInput
): ClinicalBaseConstructionResult => {
  const started = performance.now();
  const stages: Record<string, number> = {};
  const mark = (name: string, t0: number) => {
    stages[name] = performance.now() - t0;
  };
  const warnings: string[] = [];
  const height = Math.max(0.5, input.height);
  const thickness = Math.max(0.1, input.thickness);
  const offset = Math.max(0, input.offset);
  const maxSamples = input.maxBoundarySamples ?? 8192;

  let t0 = performance.now();
  const dominant = keepLargestFaceComponent(input.mesh);
  const mesh = dominant.mesh;
  if (dominant.droppedFaces > 0) {
    warnings.push(
      `dropped ${String(dominant.droppedFaces)} faces from ${String(dominant.components - 1)} non-dominant component(s)`
    );
  }
  mark('component-filter', t0);

  t0 = performance.now();
  const selected = selectClinicalBaseBoundary(
    mesh,
    input.preferClinicalFrame === true ? input.clinicalBaseNormal : input.clinicalBaseNormal
  );
  mark('boundary-extract', t0);
  if (!selected.ok) {
    return {
      ok: false,
      code: selected.code,
      message: selected.message,
      warnings
    };
  }
  const analyzed = selected.analyzed;
  warnings.push(
    `selectedBoundary=#${String(analyzed.candidate.id)} verts=${String(analyzed.pointCount)} perimeter=${analyzed.perimeter.toFixed(2)}`
  );

  // Clinical frame normal (prefer clinical when aligned with the border plane).
  t0 = performance.now();
  let planeNormal = analyzed.averageNormal;
  if (input.clinicalBaseNormal !== undefined) {
    const align =
      analyzed.averageNormal[0] * input.clinicalBaseNormal[0] +
      analyzed.averageNormal[1] * input.clinicalBaseNormal[1] +
      analyzed.averageNormal[2] * input.clinicalBaseNormal[2];
    if (Math.abs(align) > 0.35) {
      const sign = align >= 0 ? 1 : -1;
      planeNormal = [
        input.clinicalBaseNormal[0] * sign,
        input.clinicalBaseNormal[1] * sign,
        input.clinicalBaseNormal[2] * sign
      ];
    } else {
      // Forced clinical axis orthogonal to the actual border collapses the rim
      // into a near-line (degenerate fills). Keep the boundary-fitted plane and
      // only flip it toward the clinical superior when possible.
      warnings.push(
        'clinicalBaseNormal poorly aligned with boundary plane; using boundary-fitted plane'
      );
      const flip =
        planeNormal[0] * input.clinicalBaseNormal[0] +
        planeNormal[1] * input.clinicalBaseNormal[1] +
        planeNormal[2] * input.clinicalBaseNormal[2];
      if (flip < 0) {
        planeNormal = [-planeNormal[0], -planeNormal[1], -planeNormal[2]];
      }
    }
  }
  mark('base-plane', t0);

  // Planarity gate — project if residual is moderate; FAIL if extreme.
  const meanEdge =
    analyzed.perimeter / Math.max(1, analyzed.pointCount);
  const planarityTol = Math.max(1.5, meanEdge * 4, analyzed.perimeter * 0.01);
  if (analyzed.maxPlaneDistance > planarityTol * 3) {
    return {
      ok: false,
      code: 'NON_PLANAR_BOUNDARY',
      message: `Boundary is not sufficiently planar for base construction (maxDistance=${analyzed.maxPlaneDistance.toFixed(2)} mm)`,
      selectedBoundary: analyzed.candidate,
      warnings
    };
  }

  t0 = performance.now();
  let topIndices = cleanLoopIndices(mesh, analyzed.candidate.vertexIndices);
  const resampled = resampleBoundaryIndices(mesh, topIndices, maxSamples);
  topIndices = resampled.indices;
  if (resampled.warning) warnings.push(resampled.warning);
  if (topIndices.length < 3) {
    return {
      ok: false,
      code: 'INVALID_BOUNDARY',
      message: 'Boundary collapsed during cleaning/resampling',
      selectedBoundary: analyzed.candidate,
      warnings
    };
  }

  const topPoints = topIndices.map((vi) => vertexPoint(mesh, vi));
  let topPerimeter = 0;
  for (let i = 0; i < topPoints.length; i += 1) {
    topPerimeter += dist3(topPoints[i]!, topPoints[(i + 1) % topPoints.length]!);
  }
  // Plane origin: project centroid; place base below along -normal by height.
  const origin = analyzed.centroid;
  // Ensure we extrude inferior: base plane is min of boundary projections − height.
  let minProj = Infinity;
  for (const p of topPoints) {
    minProj = Math.min(minProj, planeDistance(p, origin, planeNormal));
  }
  const extrude =
    input.strategy === 'offset' ? Math.max(height, thickness) : height;
  const basePlaneOffset = minProj - extrude;
  const basis = orthonormalBasis(planeNormal);

  // Project top points onto fitted plane for triangulation UV (bounded deviation).
  const planarTop: [number, number, number][] = topPoints.map((p) => {
    const d = planeDistance(p, origin, planeNormal);
    return [
      p[0] - planeNormal[0] * d,
      p[1] - planeNormal[1] * d,
      p[2] - planeNormal[2] * d
    ];
  });
  const uv = planarTop.map((p) => projectToPlaneUv(p, origin, basis.u, basis.v));

  // Bottom points: same lateral position as top, moved along clinical normal to base plane.
  // (Do not use planarTop as the wall top — walls attach to real boundary vertices.)
  const bottomPoints: [number, number, number][] = topPoints.map((p) => {
    const d = planeDistance(p, origin, planeNormal);
    const shift = d - basePlaneOffset;
    return [
      p[0] - planeNormal[0] * shift,
      p[1] - planeNormal[1] * shift,
      p[2] - planeNormal[2] * shift
    ];
  });

  // Optional thickness: second offset further inferior for a plate.
  const plateThickness =
    input.strategy === 'offset' ? Math.max(0.2, thickness * 0.5 + offset * 0.1) : Math.max(0, thickness * 0.15);
  mark('boundary-prepare', t0);

  t0 = performance.now();
  const fan = centroidFanUv(uv);
  const ear = fan === undefined ? earClipUv(uv) : undefined;
  if (fan === undefined && (ear === undefined || ear.length === 0)) {
    return {
      ok: false,
      code: 'TRIANGULATION_FAILED',
      message: 'Unable to triangulate clinical boundary without diagonal bridges',
      selectedBoundary: analyzed.candidate,
      warnings
    };
  }
  mark('triangulation', t0);

  t0 = performance.now();
  const positions = Array.from(mesh.positions);
  const indices = Array.from(mesh.indices);
  const originalTriCount = Math.floor(mesh.indices.length / 3);
  const bottomStart = Math.floor(positions.length / 3);
  for (const p of bottomPoints) {
    positions.push(p[0], p[1], p[2]);
  }

  // Optional centroid vertex on base plane (and top plane for surface fill).
  let topCentroidIdx = -1;
  let bottomCentroidIdx = -1;
  const useCentroid = fan !== undefined;
  if (useCentroid && fan !== undefined) {
    const cUv = fan.centroidUv;
    const onOriginPlane: [number, number, number] = [
      origin[0] + basis.u[0] * cUv.x + basis.v[0] * cUv.y,
      origin[1] + basis.u[1] * cUv.x + basis.v[1] * cUv.y,
      origin[2] + basis.u[2] * cUv.x + basis.v[2] * cUv.y
    ];
    const d0 = planeDistance(onOriginPlane, origin, planeNormal);
    const bottomC: [number, number, number] = [
      onOriginPlane[0] - planeNormal[0] * (d0 - basePlaneOffset),
      onOriginPlane[1] - planeNormal[1] * (d0 - basePlaneOffset),
      onOriginPlane[2] - planeNormal[2] * (d0 - basePlaneOffset)
    ];
    topCentroidIdx = Math.floor(positions.length / 3);
    positions.push(onOriginPlane[0], onOriginPlane[1], onOriginPlane[2]);
    bottomCentroidIdx = Math.floor(positions.length / 3);
    positions.push(bottomC[0], bottomC[1], bottomC[2]);
  }

  let plateStart = -1;
  let plateCentroidIdx = -1;
  if (plateThickness > 1e-6 && input.strategy !== 'surface') {
    plateStart = Math.floor(positions.length / 3);
    for (const p of bottomPoints) {
      positions.push(
        p[0] - planeNormal[0] * plateThickness,
        p[1] - planeNormal[1] * plateThickness,
        p[2] - planeNormal[2] * plateThickness
      );
    }
    if (useCentroid && bottomCentroidIdx >= 0) {
      const bx = positions[bottomCentroidIdx * 3]!;
      const by = positions[bottomCentroidIdx * 3 + 1]!;
      const bz = positions[bottomCentroidIdx * 3 + 2]!;
      plateCentroidIdx = Math.floor(positions.length / 3);
      positions.push(
        bx - planeNormal[0] * plateThickness,
        by - planeNormal[1] * plateThickness,
        bz - planeNormal[2] * plateThickness
      );
    }
  }

  const mapFanTri = (
    tri: readonly number[],
    ringStart: number,
    centroidIdx: number,
    ringCount: number
  ): [number, number, number] => {
    const map = (i: number) => (i === ringCount ? centroidIdx : ringStart + i);
    return [map(tri[0]!), map(tri[1]!), map(tri[2]!)];
  };

  let added = 0;
  const fillTris = fan?.tris ?? ear!;
  const ringCount = topIndices.length;

  if (input.strategy === 'surface') {
    if (useCentroid && topCentroidIdx >= 0) {
      for (const tri of fillTris) {
        const [a, b, c] = mapFanTri(tri, 0, topCentroidIdx, ringCount);
        // Map ring indices through topIndices
        const ia = tri[0] === ringCount ? topCentroidIdx : topIndices[tri[0]!]!;
        const ib = tri[1] === ringCount ? topCentroidIdx : topIndices[tri[1]!]!;
        const ic = tri[2] === ringCount ? topCentroidIdx : topIndices[tri[2]!]!;
        void a;
        void b;
        void c;
        indices.push(ia, ib, ic);
        added += 1;
      }
    } else {
      for (const tri of fillTris) {
        indices.push(topIndices[tri[0]!]!, topIndices[tri[1]!]!, topIndices[tri[2]!]!);
        added += 1;
      }
    }
  } else {
    const n = topIndices.length;
    for (let i = 0; i < n; i += 1) {
      const a = topIndices[i]!;
      const b = topIndices[(i + 1) % n]!;
      const a2 = bottomStart + i;
      const b2 = bottomStart + ((i + 1) % n);
      indices.push(a, b, b2);
      indices.push(a, b2, a2);
      added += 2;
    }
    // Thickness plate: walls bottom→plate + fill plate floor only.
    // Do NOT also fill the intermediate bottom ring — that would make bottom-ring
    // edges non-manifold (wall + mid-fill + plate-wall = 3 faces).
    if (plateStart >= 0) {
      for (let i = 0; i < n; i += 1) {
        const a = bottomStart + i;
        const b = bottomStart + ((i + 1) % n);
        const a2 = plateStart + i;
        const b2 = plateStart + ((i + 1) % n);
        indices.push(a, b, b2);
        indices.push(a, b2, a2);
        added += 2;
      }
      if (useCentroid && plateCentroidIdx >= 0) {
        for (const tri of fillTris) {
          const [i0, i1, i2] = mapFanTri(tri, plateStart, plateCentroidIdx, ringCount);
          indices.push(i0, i2, i1);
          added += 1;
        }
      } else {
        for (const tri of fillTris) {
          const i0 = plateStart + tri[0]!;
          const i1 = plateStart + tri[1]!;
          const i2 = plateStart + tri[2]!;
          indices.push(i0, i2, i1);
          added += 1;
        }
      }
    } else if (useCentroid && bottomCentroidIdx >= 0) {
      for (const tri of fillTris) {
        const [i0, i1, i2] = mapFanTri(tri, bottomStart, bottomCentroidIdx, ringCount);
        indices.push(i0, i2, i1);
        added += 1;
      }
    } else {
      for (const tri of fillTris) {
        const i0 = bottomStart + tri[0]!;
        const i1 = bottomStart + tri[1]!;
        const i2 = bottomStart + tri[2]!;
        indices.push(i0, i2, i1);
        added += 1;
      }
    }
  }
  mark('wall-generation', t0);

  t0 = performance.now();
  const posArr = new Float32Array(positions);
  const idxArr = new Uint32Array(indices);
  for (let i = 0; i < posArr.length; i += 1) {
    if (!Number.isFinite(posArr[i]!)) {
      return {
        ok: false,
        code: 'NON_FINITE',
        message: 'Base construction produced non-finite coordinates',
        selectedBoundary: analyzed.candidate,
        warnings
      };
    }
  }
  const outMesh = createMesh({
    id: input.id ?? mesh.id,
    objectId: mesh.objectId,
    role: input.role ?? 'working',
    revision: input.revision ?? mesh.revision + 1,
    positions: posArr,
    indices: idxArr,
    fingerprint: fingerprintMesh(posArr, idxArr)
  });

  const qualityBefore = analyzeMesh(mesh);
  const edgesBefore = countEdgeUses(mesh.indices);
  const degeneratesBefore = countDegenerate(mesh.positions, mesh.indices);
  const qualityAfter = analyzeMesh(outMesh);
  const edges = countEdgeUses(idxArr);
  const degenerates = countDegenerate(posArr, idxArr);
  const newDegenerates = Math.max(0, degenerates - degeneratesBefore);
  const spanX = analyzed.bounds.max[0] - analyzed.bounds.min[0];
  const spanY = analyzed.bounds.max[1] - analyzed.bounds.min[1];
  const spanZ = analyzed.bounds.max[2] - analyzed.bounds.min[2];
  const archWidth = Math.max(spanX, spanY, spanZ);
  const originalVertexCount = Math.floor(mesh.positions.length / 3);
  const bridges = detectDiagonalBridges(
    posArr,
    idxArr,
    archWidth,
    analyzed.centroid,
    originalTriCount,
    originalVertexCount
  );

  // Boundary match: bottom perimeter vs construction-ring perimeter (same N, 1:1).
  let bottomPerim = 0;
  for (let i = 0; i < bottomPoints.length; i += 1) {
    bottomPerim += dist3(bottomPoints[i]!, bottomPoints[(i + 1) % bottomPoints.length]!);
  }
  let planarPerim = 0;
  for (let i = 0; i < planarTop.length; i += 1) {
    planarPerim += dist3(planarTop[i]!, planarTop[(i + 1) % planarTop.length]!);
  }
  const perimeterRatio =
    planarPerim > 1e-6 ? bottomPerim / planarPerim : 1;
  let meanWall = 0;
  let maxWall = 0;
  let minWall = Infinity;
  for (let i = 0; i < topPoints.length; i += 1) {
    const d = dist3(topPoints[i]!, bottomPoints[i]!);
    meanWall += d;
    maxWall = Math.max(maxWall, d);
    minWall = Math.min(minWall, d);
  }
  meanWall /= Math.max(1, topPoints.length);

  // Engineering tolerance from mesh scale + boundary sampling (mean edge).
  const matchTol = Math.max(1.0, meanEdge * 2, topPerimeter * 0.02);
  const matchMax = maxWall - minWall;
  // Min wall length must track requested extrude; mean can exceed it on non-planar rims.
  const matchMean = Math.abs(minWall - extrude);
  const boundaryMatchPassed =
    input.strategy === 'surface'
      ? true
      : Math.abs(perimeterRatio - 1) < 0.15 &&
        Number.isFinite(minWall) &&
        matchMean < matchTol * 3;

  const aabbPerim = aabbRectanglePerimeter(analyzed.bounds, planeNormal);
  const aabbRatio = aabbPerim > 1e-6 ? bottomPerim / aabbPerim : 0;
  const clinicalVsAabb = aabbPerim > 1e-6 ? planarPerim / aabbPerim : 1;
  // Slab = generated perimeter ≈ AABB while the clinical planar border does not.
  const slabDetected =
    input.strategy !== 'surface' &&
    Math.abs(aabbRatio - 1) < 0.12 &&
    clinicalVsAabb > 1.25 &&
    Math.abs(bottomPerim / Math.max(1e-6, planarPerim) - 1) > 0.2;

  const bridgeRejected = bridges.count >= 3 && bridges.ratio > 0.02;
  const blocking: string[] = [];
  if (slabDetected) blocking.push('BASE_SLAB_DETECTED');
  if (bridgeRejected) blocking.push('DIAGONAL_BRIDGE');
  if (!boundaryMatchPassed) blocking.push('BOUNDARY_MATCH_FAIL');
  if (newDegenerates > Math.max(2, Math.floor(added * 0.01))) blocking.push('DEGENERATE_TRIANGLES');
  if (edges.nonManifold > edgesBefore.nonManifold) blocking.push('NON_MANIFOLD');
  if (qualityAfter.connectedComponentCount > qualityBefore.connectedComponentCount + 1) {
    blocking.push('BASE_DISCONNECTED');
  }
  if (qualityAfter.surfaceArea > qualityBefore.surfaceArea * 8) {
    blocking.push('BASE_AREA_EXPLOSION');
  }
  if (added <= 0 || outMesh.fingerprint === mesh.fingerprint) {
    blocking.push('NO_GEOMETRY_CHANGE');
  }

  const intendedClosed = input.strategy !== 'surface';
  const watertight =
    intendedClosed && edges.boundary === 0 && edges.nonManifold === 0 && newDegenerates === 0;

  const durationMs = performance.now() - started;
  mark('validation', t0);
  const quality: BaseQualityReport = {
    inputFingerprint: mesh.fingerprint,
    outputFingerprint: outMesh.fingerprint,
    boundaryPointCount: topIndices.length,
    boundaryLength: analyzed.perimeter,
    planeFitResidual: analyzed.planeFitResidual,
    maxPlaneDistance: analyzed.maxPlaneDistance,
    meanPlaneDistance: analyzed.meanPlaneDistance,
    p95PlaneDistance: analyzed.p95PlaneDistance,
    baseArea: analyzed.enclosedArea,
    baseVolumeEstimate: analyzed.enclosedArea * extrude,
    thicknessStats: {
      min: minWall === Infinity ? 0 : minWall,
      max: maxWall,
      mean: meanWall
    },
    componentCount: qualityAfter.connectedComponentCount,
    boundaryEdgeCount: edges.boundary,
    nonManifoldEdgeCount: edges.nonManifold,
    degenerateTriangleCount: newDegenerates,
    selfIntersection: bridgeRejected,
    watertight,
    manifold: edges.nonManifold === 0,
    boundaryMatch: {
      meanDistance: matchMean,
      maxDistance: matchMax,
      perimeterRatio,
      passed: boundaryMatchPassed,
      toleranceMm: matchTol
    },
    slabDetection: {
      detected: slabDetected,
      aabbPerimeterRatio: aabbRatio,
      reason: slabDetected
        ? 'Generated perimeter approximates AABB rectangle instead of dental boundary'
        : 'ok'
    },
    diagonalBridgeDetection: {
      suspiciousFaceCount: bridges.count,
      suspiciousFaceRatio: bridges.ratio,
      rejected: bridgeRejected
    },
    durationMs,
    stageTimingsMs: stages,
    blockingFailures: blocking
  };

  if (blocking.length > 0) {
    return {
      ok: false,
      code: blocking[0]!,
      message: `Base quality gate failed: ${blocking.join(', ')}`,
      quality,
      selectedBoundary: analyzed.candidate,
      warnings
    };
  }

  warnings.push(
    `geo001d=clinical-base-v2 strategy=${input.strategy} extrude=${extrude.toFixed(2)} samples=${String(topIndices.length)}`
  );
  return {
    ok: true,
    mesh: outMesh,
    selectedBoundary: analyzed.candidate,
    analyzed,
    addedTriangles: added,
    quality,
    warnings
  };
};
