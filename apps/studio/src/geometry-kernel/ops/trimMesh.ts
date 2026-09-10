/**
 * Clinical trim — remove interior of a 2D boundary polygon from a TriangleMesh.
 *
 * Projection model:
 * - Boundary points in mesh XY (or normalized 0..1) map through the mesh AABB.
 * - If any |coord| > 50, points are treated as screen-space against a virtual
 *   viewport of 640×480, then mapped into the mesh AABB XY extents.
 *
 * Straddling triangles: kept when centroid is outside (CLN-008 limitation;
 * exact edge clipping is deferred to the native backend).
 */

import {
  createMesh,
  fingerprintMesh,
  computeAABB,
  type MeshRole,
  type TriangleMesh
} from '../mesh/TriangleMesh.js';
import {
  runGeometryQualityPipeline,
  type GeometryQualityReport
} from '../quality/GeometryQualityPipeline.js';
import { GeometryKernelError } from '../errors.js';

export interface TrimPoint2D {
  readonly x: number;
  readonly y: number;
}

/** Alias for clinical stroke payloads. */
export type TrimBoundaryPoint = TrimPoint2D;

export interface TrimMeshOptions {
  readonly boundary: readonly TrimPoint2D[];
  readonly role?: MeshRole;
  readonly revision?: number;
  readonly id?: number;
}

export interface TrimMeshResult {
  readonly mesh: TriangleMesh;
  readonly quality: GeometryQualityReport;
  readonly removedTriangles: number;
  readonly keptTriangles: number;
  readonly retainedTriangles: number;
  readonly warnings: readonly string[];
}

const VIRTUAL_VIEWPORT_W = 640;
const VIRTUAL_VIEWPORT_H = 480;

const looksLikeScreenSpace = (points: readonly TrimPoint2D[]): boolean =>
  points.some((p) => Math.abs(p.x) > 50 || Math.abs(p.y) > 50);

export const projectBoundaryToMeshXY = (
  points: readonly TrimPoint2D[],
  mesh: TriangleMesh
): TrimPoint2D[] => {
  const aabb = computeAABB(mesh.positions);
  const minX = aabb.min[0];
  const minY = aabb.min[1];
  const spanX = Math.max(1e-9, aabb.max[0] - aabb.min[0]);
  const spanY = Math.max(1e-9, aabb.max[1] - aabb.min[1]);

  if (looksLikeScreenSpace(points)) {
    return points.map((p) => {
      const nx = p.x / VIRTUAL_VIEWPORT_W;
      const ny = 1 - p.y / VIRTUAL_VIEWPORT_H;
      return { x: minX + nx * spanX, y: minY + ny * spanY };
    });
  }

  const maxAbs = points.reduce((m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.y)), 0);
  if (maxAbs <= 1.0001) {
    return points.map((p) => ({
      x: minX + p.x * spanX,
      y: minY + p.y * spanY
    }));
  }
  return points.map((p) => ({ x: p.x, y: p.y }));
};

export const pointInPolygon = (x: number, y: number, poly: readonly TrimPoint2D[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
};

export const trimMesh = (mesh: TriangleMesh, options: TrimMeshOptions): TrimMeshResult => {
  if (options.boundary.length < 3) {
    throw new GeometryKernelError('BOUNDARY_INVALID', 'Trim boundary requires ≥ 3 points');
  }

  const poly = projectBoundaryToMeshXY(options.boundary, mesh);
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const keepFlags = new Uint8Array(triangleCount);
  let keptTriangles = 0;
  let removedTriangles = 0;

  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    const cx =
      (mesh.positions[i0 * 3]! + mesh.positions[i1 * 3]! + mesh.positions[i2 * 3]!) / 3;
    const cy =
      (mesh.positions[i0 * 3 + 1]! +
        mesh.positions[i1 * 3 + 1]! +
        mesh.positions[i2 * 3 + 1]!) /
      3;
    if (!pointInPolygon(cx, cy, poly)) {
      keepFlags[t] = 1;
      keptTriangles += 1;
    } else {
      removedTriangles += 1;
    }
  }

  const remap = new Map<number, number>();
  const newPositions: number[] = [];
  const newIndices: number[] = [];
  const mapVertex = (old: number): number => {
    const existing = remap.get(old);
    if (existing !== undefined) {
      return existing;
    }
    const next = remap.size;
    remap.set(old, next);
    newPositions.push(
      mesh.positions[old * 3]!,
      mesh.positions[old * 3 + 1]!,
      mesh.positions[old * 3 + 2]!
    );
    return next;
  };

  for (let t = 0; t < triangleCount; t += 1) {
    if (!keepFlags[t]) continue;
    newIndices.push(
      mapVertex(mesh.indices[t * 3]!),
      mapVertex(mesh.indices[t * 3 + 1]!),
      mapVertex(mesh.indices[t * 3 + 2]!)
    );
  }

  if (newIndices.length === 0) {
    throw new GeometryKernelError(
      'GEOMETRY_BACKEND_FAILED',
      'Trim removed entire mesh; refine boundary'
    );
  }

  const positions = new Float32Array(newPositions);
  const indices = new Uint32Array(newIndices);
  const role = options.role ?? 'preview';
  const result = createMesh({
    id: options.id ?? mesh.id,
    objectId: mesh.objectId,
    role,
    revision: options.revision ?? mesh.revision + 1,
    positions,
    indices,
    fingerprint: fingerprintMesh(positions, indices)
  });

  const quality = runGeometryQualityPipeline(result);
  const warnings = [
    ...quality.warnings,
    'Trim uses centroid classification; straddling triangles kept if centroid outside (CLN-008 limitation)'
  ];

  return {
    mesh: result,
    quality,
    removedTriangles,
    keptTriangles,
    retainedTriangles: keptTriangles,
    warnings
  };
};

/** Compatibility alias. */
export const trimMeshByBoundary = (
  source: TriangleMesh,
  boundary: readonly TrimPoint2D[],
  options?: {
    readonly role?: 'preview' | 'working';
    readonly revision?: number;
    readonly handleId?: number;
  }
): TrimMeshResult =>
  trimMesh(source, {
    boundary,
    ...(options?.role !== undefined ? { role: options.role } : {}),
    ...(options?.revision !== undefined ? { revision: options.revision } : {}),
    ...(options?.handleId !== undefined ? { id: options.handleId } : {})
  });
