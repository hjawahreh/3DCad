/**
 * GEO-001 PHASE B — triangle AABB tree (deterministic BVH) + ray / nearest queries.
 * Extends existing SpatialIndex without adding third-party libraries.
 */

import { computeAABB, type AABB, type TriangleMesh } from '../mesh/TriangleMesh.js';
import { buildSpatialIndex, type SpatialIndex, type Vec3 } from '../spatial/SpatialIndex.js';
import { buildTopology, type TopologyGraph } from './TopologyGraph.js';
import type { SurfaceHit, SurfaceMiss, SurfaceQueryResult } from './types.js';

interface BvhNode {
  readonly aabb: AABB;
  readonly left?: BvhNode;
  readonly right?: BvhNode;
  readonly triangleIndices?: readonly number[];
}

export interface ClinicalSpatialIndex {
  readonly kind: 'triangle-bvh+vertex-kdtree';
  readonly meshFingerprint: string;
  readonly base: SpatialIndex;
  readonly topology: TopologyGraph;
  readonly bvhRoot: BvhNode;
}

const spatialCache = new Map<string, ClinicalSpatialIndex>();

export const invalidateSpatialCache = (fingerprint?: string): void => {
  if (fingerprint === undefined) spatialCache.clear();
  else spatialCache.delete(fingerprint);
};

const unionAabb = (a: AABB, b: AABB): AABB => ({
  min: [
    Math.min(a.min[0], b.min[0]),
    Math.min(a.min[1], b.min[1]),
    Math.min(a.min[2], b.min[2])
  ],
  max: [
    Math.max(a.max[0], b.max[0]),
    Math.max(a.max[1], b.max[1]),
    Math.max(a.max[2], b.max[2])
  ]
});

const triangleAabb = (mesh: TriangleMesh, t: number): AABB => {
  const i0 = mesh.indices[t * 3]!;
  const i1 = mesh.indices[t * 3 + 1]!;
  const i2 = mesh.indices[t * 3 + 2]!;
  const ax = mesh.positions[i0 * 3]!;
  const ay = mesh.positions[i0 * 3 + 1]!;
  const az = mesh.positions[i0 * 3 + 2]!;
  const bx = mesh.positions[i1 * 3]!;
  const by = mesh.positions[i1 * 3 + 1]!;
  const bz = mesh.positions[i1 * 3 + 2]!;
  const cx = mesh.positions[i2 * 3]!;
  const cy = mesh.positions[i2 * 3 + 1]!;
  const cz = mesh.positions[i2 * 3 + 2]!;
  return {
    min: [Math.min(ax, bx, cx), Math.min(ay, by, cy), Math.min(az, bz, cz)],
    max: [Math.max(ax, bx, cx), Math.max(ay, by, cy), Math.max(az, bz, cz)]
  };
};

const buildBvh = (mesh: TriangleMesh, indices: number[], depth: number): BvhNode => {
  let aabb = triangleAabb(mesh, indices[0]!);
  for (let i = 1; i < indices.length; i += 1) {
    aabb = unionAabb(aabb, triangleAabb(mesh, indices[i]!));
  }
  if (indices.length <= 8 || depth > 24) {
    return { aabb, triangleIndices: indices };
  }
  const axis =
    aabb.max[0] - aabb.min[0] >= aabb.max[1] - aabb.min[1] &&
    aabb.max[0] - aabb.min[0] >= aabb.max[2] - aabb.min[2]
      ? 0
      : aabb.max[1] - aabb.min[1] >= aabb.max[2] - aabb.min[2]
        ? 1
        : 2;
  const sorted = [...indices].sort((ia, ib) => {
    const ca = triangleAabb(mesh, ia);
    const cb = triangleAabb(mesh, ib);
    return (ca.min[axis]! + ca.max[axis]!) / 2 - (cb.min[axis]! + cb.max[axis]!) / 2;
  });
  const mid = Math.floor(sorted.length / 2);
  return {
    aabb,
    left: buildBvh(mesh, sorted.slice(0, mid), depth + 1),
    right: buildBvh(mesh, sorted.slice(mid), depth + 1)
  };
};

const rayAabb = (
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  aabb: AABB,
  tMax: number
): boolean => {
  let tmin = 0;
  let tmax = tMax;
  for (let i = 0; i < 3; i += 1) {
    const o = origin[i]!;
    const d = dir[i]!;
    const min = aabb.min[i]!;
    const max = aabb.max[i]!;
    if (Math.abs(d) < 1e-12) {
      if (o < min || o > max) return false;
      continue;
    }
    const inv = 1 / d;
    let t0 = (min - o) * inv;
    let t1 = (max - o) * inv;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmax < tmin) return false;
  }
  return true;
};

/** Möller–Trumbore. Returns t,u,v or undefined. */
const intersectTriangle = (
  mesh: TriangleMesh,
  faceId: number,
  origin: readonly [number, number, number],
  dir: readonly [number, number, number]
): { t: number; u: number; v: number } | undefined => {
  const i0 = mesh.indices[faceId * 3]!;
  const i1 = mesh.indices[faceId * 3 + 1]!;
  const i2 = mesh.indices[faceId * 3 + 2]!;
  const ax = mesh.positions[i0 * 3]!;
  const ay = mesh.positions[i0 * 3 + 1]!;
  const az = mesh.positions[i0 * 3 + 2]!;
  const e1x = mesh.positions[i1 * 3]! - ax;
  const e1y = mesh.positions[i1 * 3 + 1]! - ay;
  const e1z = mesh.positions[i1 * 3 + 2]! - az;
  const e2x = mesh.positions[i2 * 3]! - ax;
  const e2y = mesh.positions[i2 * 3 + 1]! - ay;
  const e2z = mesh.positions[i2 * 3 + 2]! - az;
  const px = dir[1]! * e2z - dir[2]! * e2y;
  const py = dir[2]! * e2x - dir[0]! * e2z;
  const pz = dir[0]! * e2y - dir[1]! * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return undefined;
  const invDet = 1 / det;
  const tx = origin[0]! - ax;
  const ty = origin[1]! - ay;
  const tz = origin[2]! - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < 0 || u > 1) return undefined;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dir[0]! * qx + dir[1]! * qy + dir[2]! * qz) * invDet;
  if (v < 0 || u + v > 1) return undefined;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t < 1e-8) return undefined;
  return { t, u, v };
};

const faceNormal = (
  mesh: TriangleMesh,
  faceId: number
): readonly [number, number, number] => {
  const i0 = mesh.indices[faceId * 3]!;
  const i1 = mesh.indices[faceId * 3 + 1]!;
  const i2 = mesh.indices[faceId * 3 + 2]!;
  const ax = mesh.positions[i0 * 3]!;
  const ay = mesh.positions[i0 * 3 + 1]!;
  const az = mesh.positions[i0 * 3 + 2]!;
  const bx = mesh.positions[i1 * 3]!;
  const by = mesh.positions[i1 * 3 + 1]!;
  const bz = mesh.positions[i1 * 3 + 2]!;
  const cx = mesh.positions[i2 * 3]!;
  const cy = mesh.positions[i2 * 3 + 1]!;
  const cz = mesh.positions[i2 * 3 + 2]!;
  const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
};

const closestPointOnTriangle = (
  mesh: TriangleMesh,
  faceId: number,
  p: readonly [number, number, number]
): { point: readonly [number, number, number]; bary: readonly [number, number, number]; dist2: number } => {
  const i0 = mesh.indices[faceId * 3]!;
  const i1 = mesh.indices[faceId * 3 + 1]!;
  const i2 = mesh.indices[faceId * 3 + 2]!;
  const a: [number, number, number] = [
    mesh.positions[i0 * 3]!,
    mesh.positions[i0 * 3 + 1]!,
    mesh.positions[i0 * 3 + 2]!
  ];
  const b: [number, number, number] = [
    mesh.positions[i1 * 3]!,
    mesh.positions[i1 * 3 + 1]!,
    mesh.positions[i1 * 3 + 2]!
  ];
  const c: [number, number, number] = [
    mesh.positions[i2 * 3]!,
    mesh.positions[i2 * 3 + 1]!,
    mesh.positions[i2 * 3 + 2]!
  ];
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const apz = p[2] - a[2];
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    const dist2 = apx * apx + apy * apy + apz * apz;
    return { point: a, bary: [1, 0, 0], dist2 };
  }
  const bpx = p[0] - b[0];
  const bpy = p[1] - b[1];
  const bpz = p[2] - b[2];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    const dist2 = bpx * bpx + bpy * bpy + bpz * bpz;
    return { point: b, bary: [0, 1, 0], dist2 };
  }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const point: [number, number, number] = [a[0] + abx * v, a[1] + aby * v, a[2] + abz * v];
    const dx = p[0] - point[0];
    const dy = p[1] - point[1];
    const dz = p[2] - point[2];
    return { point, bary: [1 - v, v, 0], dist2: dx * dx + dy * dy + dz * dz };
  }
  const cpx = p[0] - c[0];
  const cpy = p[1] - c[1];
  const cpz = p[2] - c[2];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    const dist2 = cpx * cpx + cpy * cpy + cpz * cpz;
    return { point: c, bary: [0, 0, 1], dist2 };
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const point: [number, number, number] = [a[0] + acx * w, a[1] + acy * w, a[2] + acz * w];
    const dx = p[0] - point[0];
    const dy = p[1] - point[1];
    const dz = p[2] - point[2];
    return { point, bary: [1 - w, 0, w], dist2: dx * dx + dy * dy + dz * dz };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const point: [number, number, number] = [
      b[0] + (c[0] - b[0]) * w,
      b[1] + (c[1] - b[1]) * w,
      b[2] + (c[2] - b[2]) * w
    ];
    const dx = p[0] - point[0];
    const dy = p[1] - point[1];
    const dz = p[2] - point[2];
    return { point, bary: [0, 1 - w, w], dist2: dx * dx + dy * dy + dz * dz };
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const point: [number, number, number] = [
    a[0] + abx * v + acx * w,
    a[1] + aby * v + acy * w,
    a[2] + abz * v + acz * w
  ];
  const dx = p[0] - point[0];
  const dy = p[1] - point[1];
  const dz = p[2] - point[2];
  return { point, bary: [1 - v - w, v, w], dist2: dx * dx + dy * dy + dz * dz };
};

export const buildClinicalSpatialIndex = (mesh: TriangleMesh): ClinicalSpatialIndex => {
  const cached = spatialCache.get(mesh.fingerprint);
  if (cached !== undefined) return cached;
  const base = buildSpatialIndex(mesh);
  const topology = buildTopology(mesh);
  const faceCount = Math.floor(mesh.indices.length / 3);
  const indices = Array.from({ length: faceCount }, (_, i) => i);
  const bvhRoot = buildBvh(mesh, indices, 0);
  const index: ClinicalSpatialIndex = {
    kind: 'triangle-bvh+vertex-kdtree',
    meshFingerprint: mesh.fingerprint,
    base,
    topology,
    bvhRoot
  };
  spatialCache.set(mesh.fingerprint, index);
  return index;
};

export const rayIntersectMesh = (
  mesh: TriangleMesh,
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  spatial?: ClinicalSpatialIndex
): SurfaceQueryResult => {
  const index = spatial ?? buildClinicalSpatialIndex(mesh);
  const len = Math.hypot(direction[0], direction[1], direction[2]);
  if (!(len > 0)) return { hit: false } satisfies SurfaceMiss;
  const dir: [number, number, number] = [
    direction[0] / len,
    direction[1] / len,
    direction[2] / len
  ];
  let bestT = Number.POSITIVE_INFINITY;
  let bestFace = -1;
  let bestU = 0;
  let bestV = 0;

  const visit = (node: BvhNode): void => {
    if (!rayAabb(origin, dir, node.aabb, bestT)) return;
    if (node.triangleIndices !== undefined) {
      for (const faceId of node.triangleIndices) {
        const hit = intersectTriangle(mesh, faceId, origin, dir);
        if (hit !== undefined && hit.t < bestT) {
          bestT = hit.t;
          bestFace = faceId;
          bestU = hit.u;
          bestV = hit.v;
        }
      }
      return;
    }
    if (node.left) visit(node.left);
    if (node.right) visit(node.right);
  };
  visit(index.bvhRoot);

  if (bestFace < 0 || !Number.isFinite(bestT)) return { hit: false };
  const point: [number, number, number] = [
    origin[0] + dir[0] * bestT,
    origin[1] + dir[1] * bestT,
    origin[2] + dir[2] * bestT
  ];
  const normal = faceNormal(mesh, bestFace);
  const w = 1 - bestU - bestV;
  return {
    hit: true,
    point,
    normal,
    faceId: bestFace,
    distance: bestT,
    componentId: index.topology.components[bestFace] ?? 0,
    barycentric: [w, bestU, bestV]
  };
};

export const nearestSurfacePoint = (
  mesh: TriangleMesh,
  query: readonly [number, number, number],
  spatial?: ClinicalSpatialIndex,
  maxDistance = Number.POSITIVE_INFINITY
): SurfaceQueryResult => {
  const index = spatial ?? buildClinicalSpatialIndex(mesh);
  // Seed with nearest vertex, then refine among overlapping triangles around that locus.
  const seed = index.base.nearestVertex({ x: query[0], y: query[1], z: query[2] }, maxDistance);
  if (seed === undefined) return { hit: false };

  let bestDist2 = maxDistance * maxDistance;
  let best:
    | {
        faceId: number;
        point: readonly [number, number, number];
        bary: readonly [number, number, number];
      }
    | undefined;

  const consider = (faceId: number): void => {
    const c = closestPointOnTriangle(mesh, faceId, query);
    if (c.dist2 < bestDist2) {
      bestDist2 = c.dist2;
      best = { faceId, point: c.point, bary: c.bary };
    }
  };

  for (const faceId of index.topology.vertexToFaces[seed.index] ?? []) {
    consider(faceId);
  }

  // Expand search radius using AABB query around query point.
  const r = Math.min(Math.sqrt(bestDist2) * 1.5 + 0.5, maxDistance);
  const box: AABB = {
    min: [query[0] - r, query[1] - r, query[2] - r],
    max: [query[0] + r, query[1] + r, query[2] + r]
  };
  for (const faceId of index.base.queryTrianglesOverlapping(box)) {
    consider(faceId);
  }

  if (best === undefined) return { hit: false };
  const distance = Math.sqrt(bestDist2);
  if (distance > maxDistance) return { hit: false };
  return {
    hit: true,
    point: best.point,
    normal: faceNormal(mesh, best.faceId),
    faceId: best.faceId,
    distance,
    componentId: index.topology.components[best.faceId] ?? 0,
    barycentric: best.bary
  };
};

export const projectPointToSurface = (
  mesh: TriangleMesh,
  point: readonly [number, number, number],
  spatial?: ClinicalSpatialIndex,
  maxDistance = 2.0
): SurfaceQueryResult => nearestSurfacePoint(mesh, point, spatial, maxDistance);

export const meshBounds = (mesh: TriangleMesh): AABB => computeAABB(mesh.positions);

export type { Vec3, SurfaceHit };
