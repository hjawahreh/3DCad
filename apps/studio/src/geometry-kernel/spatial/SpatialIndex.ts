/**
 * Spatial acceleration for the isolated JS clinical geometry kernel.
 *
 * Native path prefers nanoflann / Open3D KD-trees; this module is a deterministic
 * AABB + simple KD-tree used by the TypeScript reference backend only.
 */

import { computeAABB, type AABB, type TriangleMesh } from '../mesh/TriangleMesh.js';
import { GeometryKernelError } from '../errors.js';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TriangleBounds {
  readonly triangleIndex: number;
  readonly aabb: AABB;
  readonly centroid: Vec3;
}

interface KdNode {
  readonly pointIndex: number;
  readonly axis: 0 | 1 | 2;
  readonly left?: KdNode | undefined;
  readonly right?: KdNode | undefined;
}

export interface SpatialIndex {
  readonly kind: 'aabb-kdtree';
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly meshAABB: AABB;
  readonly triangleBounds: readonly TriangleBounds[];
  nearestVertex(query: Vec3, maxDistance?: number): { index: number; distance: number } | undefined;
  queryTrianglesOverlapping(aabb: AABB): number[];
}

const midpoint = (a: AABB): Vec3 => ({
  x: (a.min[0] + a.max[0]) * 0.5,
  y: (a.min[1] + a.max[1]) * 0.5,
  z: (a.min[2] + a.max[2]) * 0.5
});

const overlaps = (a: AABB, b: AABB): boolean =>
  a.min[0] <= b.max[0] &&
  a.max[0] >= b.min[0] &&
  a.min[1] <= b.max[1] &&
  a.max[1] >= b.min[1] &&
  a.min[2] <= b.max[2] &&
  a.max[2] >= b.min[2];

const dist2 = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

const buildKd = (
  indices: number[],
  coords: Float32Array,
  depth: number
): KdNode | undefined => {
  if (indices.length === 0) {
    return undefined;
  }
  const axis = (depth % 3) as 0 | 1 | 2;
  indices.sort((ia, ib) => coords[ia * 3 + axis]! - coords[ib * 3 + axis]!);
  const mid = Math.floor(indices.length / 2);
  const pointIndex = indices[mid]!;
  const leftIdx = indices.slice(0, mid);
  const rightIdx = indices.slice(mid + 1);
  return {
    pointIndex,
    axis,
    left: buildKd(leftIdx, coords, depth + 1),
    right: buildKd(rightIdx, coords, depth + 1)
  };
};

const nearestSearch = (
  node: KdNode | undefined,
  coords: Float32Array,
  query: Vec3,
  best: { index: number; d2: number }
): void => {
  if (node === undefined) {
    return;
  }
  const px = coords[node.pointIndex * 3]!;
  const py = coords[node.pointIndex * 3 + 1]!;
  const pz = coords[node.pointIndex * 3 + 2]!;
  const d2 = dist2(query, { x: px, y: py, z: pz });
  if (d2 < best.d2) {
    best.index = node.pointIndex;
    best.d2 = d2;
  }
  const q =
    node.axis === 0 ? query.x : node.axis === 1 ? query.y : query.z;
  const p = node.axis === 0 ? px : node.axis === 1 ? py : pz;
  const delta = q - p;
  const near = delta < 0 ? node.left : node.right;
  const far = delta < 0 ? node.right : node.left;
  nearestSearch(near, coords, query, best);
  if (delta * delta < best.d2) {
    nearestSearch(far, coords, query, best);
  }
};

export const buildSpatialIndex = (mesh: TriangleMesh): SpatialIndex => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangleCount = Math.floor(mesh.indices.length / 3);
  if (vertexCount === 0 || triangleCount === 0) {
    throw new GeometryKernelError('SPATIAL_INDEX_FAILED', 'Cannot build spatial index for empty mesh');
  }
  const meshAABB = computeAABB(mesh.positions);
  const triangleBounds: TriangleBounds[] = [];
  for (let t = 0; t < triangleCount; t += 1) {
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
    const aabb: AABB = {
      min: [Math.min(ax, bx, cx), Math.min(ay, by, cy), Math.min(az, bz, cz)],
      max: [Math.max(ax, bx, cx), Math.max(ay, by, cy), Math.max(az, bz, cz)]
    };
    triangleBounds.push({
      triangleIndex: t,
      aabb,
      centroid: midpoint(aabb)
    });
  }

  const vertexIndices = Array.from({ length: vertexCount }, (_, i) => i);
  const root = buildKd(vertexIndices, mesh.positions, 0);

  return {
    kind: 'aabb-kdtree',
    triangleCount,
    vertexCount,
    meshAABB,
    triangleBounds,
    nearestVertex(query, maxDistance) {
      const best = { index: -1, d2: Number.POSITIVE_INFINITY };
      nearestSearch(root, mesh.positions, query, best);
      if (best.index < 0) {
        return undefined;
      }
      const distance = Math.sqrt(best.d2);
      if (maxDistance !== undefined && distance > maxDistance) {
        return undefined;
      }
      return { index: best.index, distance };
    },
    queryTrianglesOverlapping(aabb) {
      const hits: number[] = [];
      for (const tb of triangleBounds) {
        if (overlaps(tb.aabb, aabb)) {
          hits.push(tb.triangleIndex);
        }
      }
      return hits;
    }
  };
};
