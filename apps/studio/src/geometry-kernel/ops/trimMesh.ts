/**
 * Clinical trim — remove interior of a 2D boundary polygon from a TriangleMesh.
 *
 * Projection model (PROD-001):
 * - Infer the cut plane from the mesh AABB: shortest axis = plane normal;
 *   the other two axes are U/V. This matches open dental surfaces after
 *   scanner import (orientation is transform-only and must not be assumed XY).
 * - Boundary points already in mesh U/V pass through.
 * - Normalized 0..1 points map into AABB U/V.
 * - Screen-space points (|coord| > 50) map through the live viewport size.
 *
 * Default algorithm: exact triangle/edge clipping (`trim.exact-edge-clip`).
 * Fallback: centroid-in-polygon (`trim.centroid-polygon`) when explicitly
 * requested — PROD-001R: prototype-disabled as authoritative production path.
 * Do not select centroid classification for production Trim.
 *
 * Accept invariant: zero removals with unchanged face count throws
 * "Trim produced no geometry change."
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
import {
  clipTriangleExteriorExact,
  polygonAbsoluteArea,
  type ExactTrimTriangle,
  type ExactTrimVertex
} from './trimMeshExact.js';

export interface TrimPoint2D {
  readonly x: number;
  readonly y: number;
}

/** Explicit 3D clinical loop point (surface-picked). PROD-001S VTK spike. */
export interface TrimPoint3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type TrimKeepMode =
  | 'KEEP_OUTSIDE'
  | 'KEEP_INSIDE'
  /** @deprecated Use KEEP_OUTSIDE */
  | 'remove-interior'
  /** @deprecated Use KEEP_INSIDE */
  | 'keep-interior';

export const normalizeTrimKeepMode = (mode: TrimKeepMode | undefined): 'KEEP_OUTSIDE' | 'KEEP_INSIDE' => {
  if (mode === 'KEEP_INSIDE' || mode === 'keep-interior') return 'KEEP_INSIDE';
  return 'KEEP_OUTSIDE';
};

/** Alias for clinical stroke payloads. */
export type TrimBoundaryPoint = TrimPoint2D;

export interface TrimViewportSize {
  readonly width: number;
  readonly height: number;
}

export type TrimAlgorithm =
  | 'exact-edge-clip'
  | 'centroid-polygon'
  | 'vtk-implicit-loop'
  | 'vtk-select-polydata';

/** Axis indices into XYZ for the trim projection plane. */
export interface TrimProjectionAxes {
  readonly u: 0 | 1 | 2;
  readonly v: 0 | 1 | 2;
  readonly n: 0 | 1 | 2;
}

export interface TrimMeshOptions {
  readonly boundary: readonly TrimPoint2D[];
  readonly role?: MeshRole;
  readonly revision?: number;
  readonly id?: number;
  /** Live canvas CSS pixel size for screen-space boundary projection. */
  readonly viewport?: TrimViewportSize;
  /** Defaults to exact-edge-clip. */
  readonly algorithm?: TrimAlgorithm;
  /** Override inferred projection plane (tests / advanced callers). */
  readonly projectionAxes?: TrimProjectionAxes;
  /**
   * Optional explicit 3D surface-picked loop for specialized backends (VTK).
   * When provided with `loopNormal`, AABB/screen projection must not replace it.
   */
  readonly loop3d?: readonly TrimPoint3D[];
  /** Unit normal for the clinical loop plane (Newell / local surface). */
  readonly loopNormal?: readonly [number, number, number];
  /** Clinical keep/remove meaning for specialized clippers. Default remove-interior. */
  readonly keepMode?: TrimKeepMode;
}

export interface TrimMeshResult {
  readonly mesh: TriangleMesh;
  readonly quality: GeometryQualityReport;
  readonly removedTriangles: number;
  readonly keptTriangles: number;
  readonly retainedTriangles: number;
  readonly warnings: readonly string[];
  readonly algorithm: TrimAlgorithm;
  readonly projectionAxes: TrimProjectionAxes;
}

const looksLikeScreenSpace = (points: readonly TrimPoint2D[]): boolean =>
  points.some((p) => Math.abs(p.x) > 50 || Math.abs(p.y) > 50);

/**
 * Infer UV cut plane from AABB: shortest span is the surface normal.
 * Ties break X < Y < Z preference for determinism.
 */
export const inferTrimProjectionAxes = (mesh: TriangleMesh): TrimProjectionAxes => {
  const aabb = computeAABB(mesh.positions);
  const sx = Math.max(0, aabb.max[0] - aabb.min[0]);
  const sy = Math.max(0, aabb.max[1] - aabb.min[1]);
  const sz = Math.max(0, aabb.max[2] - aabb.min[2]);
  let n: 0 | 1 | 2 = 2;
  if (sx <= sy && sx <= sz) n = 0;
  else if (sy <= sx && sy <= sz) n = 1;
  else n = 2;
  const remaining: Array<0 | 1 | 2> = ([0, 1, 2] as const).filter((a) => a !== n);
  return { u: remaining[0]!, v: remaining[1]!, n };
};

const coord = (positions: Float32Array, vi: number, axis: 0 | 1 | 2): number =>
  positions[vi * 3 + axis]!;

export const projectBoundaryToMeshPlane = (
  points: readonly TrimPoint2D[],
  mesh: TriangleMesh,
  axes: TrimProjectionAxes,
  viewport?: TrimViewportSize
): TrimPoint2D[] => {
  const aabb = computeAABB(mesh.positions);
  const minU = aabb.min[axes.u];
  const minV = aabb.min[axes.v];
  const spanU = Math.max(1e-9, aabb.max[axes.u] - aabb.min[axes.u]);
  const spanV = Math.max(1e-9, aabb.max[axes.v] - aabb.min[axes.v]);

  if (looksLikeScreenSpace(points)) {
    // Legacy callers omit viewport; never collapse to 1×1 (that maps every stroke
    // into a degenerate corner and previously allowed fake zero-change accepts).
    const vw = Math.max(1, viewport?.width ?? 640);
    const vh = Math.max(1, viewport?.height ?? 480);
    return points.map((p) => {
      const nx = p.x / vw;
      const ny = 1 - p.y / vh;
      return { x: minU + nx * spanU, y: minV + ny * spanV };
    });
  }

  const maxAbs = points.reduce((m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.y)), 0);
  if (maxAbs <= 1.0001) {
    return points.map((p) => ({
      x: minU + p.x * spanU,
      y: minV + p.y * spanV
    }));
  }
  return points.map((p) => ({ x: p.x, y: p.y }));
};

/** @deprecated Prefer projectBoundaryToMeshPlane with inferred axes. */
export const projectBoundaryToMeshXY = (
  points: readonly TrimPoint2D[],
  mesh: TriangleMesh,
  viewport?: TrimViewportSize
): TrimPoint2D[] =>
  projectBoundaryToMeshPlane(points, mesh, inferTrimProjectionAxes(mesh), viewport);

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

/** Map mesh vertex into clip space where x=U, y=V, z=N. */
const vertexAtPlane = (
  mesh: TriangleMesh,
  index: number,
  axes: TrimProjectionAxes
): ExactTrimVertex => {
  const p = mesh.positions;
  const c = [p[index * 3]!, p[index * 3 + 1]!, p[index * 3 + 2]!];
  return { x: c[axes.u]!, y: c[axes.v]!, z: c[axes.n]! };
};

/** Map clip-space vertex back to XYZ. */
const fromPlaneSpace = (v: ExactTrimVertex, axes: TrimProjectionAxes): ExactTrimVertex => {
  const out: [number, number, number] = [0, 0, 0];
  out[axes.u] = v.x;
  out[axes.v] = v.y;
  out[axes.n] = v.z;
  return { x: out[0], y: out[1], z: out[2] };
};

const quantizeKey = (v: ExactTrimVertex): string =>
  `${(v.x * 1e6).toFixed(0)}:${(v.y * 1e6).toFixed(0)}:${(v.z * 1e6).toFixed(0)}`;

const compactExactFragments = (
  mesh: TriangleMesh,
  fragments: readonly ExactTrimTriangle[],
  options: TrimMeshOptions
): TriangleMesh => {
  const remap = new Map<string, number>();
  const newPositions: number[] = [];
  const newIndices: number[] = [];

  const mapVertex = (v: ExactTrimVertex): number => {
    const key = quantizeKey(v);
    const existing = remap.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const next = remap.size;
    remap.set(key, next);
    newPositions.push(v.x, v.y, v.z);
    return next;
  };

  for (const frag of fragments) {
    const i0 = mapVertex(frag.a);
    const i1 = mapVertex(frag.b);
    const i2 = mapVertex(frag.c);
    if (i0 === i1 || i1 === i2 || i2 === i0) {
      continue;
    }
    newIndices.push(i0, i1, i2);
  }

  if (newIndices.length === 0) {
    throw new GeometryKernelError(
      'GEOMETRY_BACKEND_FAILED',
      'Trim removed entire mesh; refine boundary'
    );
  }

  const positions = new Float32Array(newPositions);
  const indices = new Uint32Array(newIndices);
  return createMesh({
    id: options.id ?? mesh.id,
    objectId: mesh.objectId,
    role: options.role ?? 'preview',
    revision: options.revision ?? mesh.revision + 1,
    positions,
    indices,
    fingerprint: fingerprintMesh(positions, indices)
  });
};

const trimMeshCentroid = (
  mesh: TriangleMesh,
  poly: readonly TrimPoint2D[],
  axes: TrimProjectionAxes,
  options: TrimMeshOptions
): {
  readonly mesh: TriangleMesh;
  readonly keptTriangles: number;
  readonly removedTriangles: number;
} => {
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const keepFlags = new Uint8Array(triangleCount);
  let keptTriangles = 0;
  let removedTriangles = 0;

  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    const cu =
      (coord(mesh.positions, i0, axes.u) +
        coord(mesh.positions, i1, axes.u) +
        coord(mesh.positions, i2, axes.u)) /
      3;
    const cv =
      (coord(mesh.positions, i0, axes.v) +
        coord(mesh.positions, i1, axes.v) +
        coord(mesh.positions, i2, axes.v)) /
      3;
    if (!pointInPolygon(cu, cv, poly)) {
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
  return {
    mesh: createMesh({
      id: options.id ?? mesh.id,
      objectId: mesh.objectId,
      role: options.role ?? 'preview',
      revision: options.revision ?? mesh.revision + 1,
      positions,
      indices,
      fingerprint: fingerprintMesh(positions, indices)
    }),
    keptTriangles,
    removedTriangles
  };
};

const trimMeshExact = (
  mesh: TriangleMesh,
  poly: readonly TrimPoint2D[],
  axes: TrimProjectionAxes,
  options: TrimMeshOptions
): {
  readonly mesh: TriangleMesh;
  readonly keptTriangles: number;
  readonly removedTriangles: number;
} => {
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const fragmentsPlane: ExactTrimTriangle[] = [];
  let removedTriangles = 0;
  let keptSource = 0;

  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    const tri: ExactTrimTriangle = {
      a: vertexAtPlane(mesh, i0, axes),
      b: vertexAtPlane(mesh, i1, axes),
      c: vertexAtPlane(mesh, i2, axes)
    };
    const before = fragmentsPlane.length;
    clipTriangleExteriorExact(tri, poly, 0, fragmentsPlane);
    if (fragmentsPlane.length === before) {
      removedTriangles += 1;
    } else if (fragmentsPlane.length === before + 1) {
      keptSource += 1;
    } else {
      keptSource += 1;
    }
  }

  const fragments = fragmentsPlane.map((frag) => ({
    a: fromPlaneSpace(frag.a, axes),
    b: fromPlaneSpace(frag.b, axes),
    c: fromPlaneSpace(frag.c, axes)
  }));

  const result = compactExactFragments(mesh, fragments, options);
  void keptSource;
  return {
    mesh: result,
    keptTriangles: Math.floor(result.indices.length / 3),
    removedTriangles
  };
};

export const trimMesh = (mesh: TriangleMesh, options: TrimMeshOptions): TrimMeshResult => {
  if (options.boundary.length < 3) {
    throw new GeometryKernelError('BOUNDARY_INVALID', 'Trim boundary requires ≥ 3 points');
  }

  const axes = options.projectionAxes ?? inferTrimProjectionAxes(mesh);
  const poly = projectBoundaryToMeshPlane(options.boundary, mesh, axes, options.viewport);
  for (const p of poly) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new GeometryKernelError('BOUNDARY_INVALID', 'Trim boundary contains non-finite values');
    }
  }

  const area = polygonAbsoluteArea(poly);
  if (area < 1e-12) {
    throw new GeometryKernelError('BOUNDARY_INVALID', 'Trim boundary area is degenerate');
  }

  const algorithm: TrimAlgorithm = options.algorithm ?? 'exact-edge-clip';
  if (algorithm === 'vtk-implicit-loop' || algorithm === 'vtk-select-polydata') {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      `${algorithm} requires VtkNativeWorkerBackend (PROD-001S/002R); clinical-reference-v1 does not run VTK`
    );
  }
  const inputFaces = Math.floor(mesh.indices.length / 3);
  const cut =
    algorithm === 'centroid-polygon'
      ? trimMeshCentroid(mesh, poly, axes, options)
      : trimMeshExact(mesh, poly, axes, options);

  const outputFaces = Math.floor(cut.mesh.indices.length / 3);
  if (cut.removedTriangles === 0 && outputFaces === inputFaces) {
    throw new GeometryKernelError(
      'VALIDATION_FAILED',
      'Trim produced no geometry change.'
    );
  }

  const quality = runGeometryQualityPipeline(cut.mesh);
  const warnings = [...quality.warnings];
  if (algorithm === 'centroid-polygon') {
    warnings.push(
      'Trim uses centroid classification; straddling triangles kept if centroid outside (legacy fallback)'
    );
  }
  warnings.push(`Trim projection axes u=${String(axes.u)} v=${String(axes.v)} n=${String(axes.n)}`);

  return {
    mesh: cut.mesh,
    quality,
    removedTriangles: cut.removedTriangles,
    keptTriangles: cut.keptTriangles,
    retainedTriangles: cut.keptTriangles,
    warnings,
    algorithm,
    projectionAxes: axes
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
    readonly algorithm?: TrimAlgorithm;
  }
): TrimMeshResult =>
  trimMesh(source, {
    boundary,
    ...(options?.role !== undefined ? { role: options.role } : {}),
    ...(options?.revision !== undefined ? { revision: options.revision } : {}),
    ...(options?.handleId !== undefined ? { id: options.handleId } : {}),
    ...(options?.algorithm !== undefined ? { algorithm: options.algorithm } : {})
  });
