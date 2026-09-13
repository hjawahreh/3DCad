/**
 * PROD-001T — 3D clinical Trim loop construction & validation.
 * No AABB / global axis projection as clip authority.
 */

import { MIN_BOUNDARY_POINTS, type TrimBoundaryPoint } from './ClinicalTrimBoundaryMath.js';

export type ClinicalTrimKeepMode = 'KEEP_OUTSIDE' | 'KEEP_INSIDE';

export interface TrimLoop3DPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TrimLoop3D {
  readonly points: readonly TrimLoop3DPoint[];
  readonly normal: readonly [number, number, number];
  readonly keepMode: ClinicalTrimKeepMode;
  readonly areaEstimate: number;
  readonly planarityRms: number;
}

export type TrimLoop3DFailure =
  | { readonly ok: false; readonly message: string }
  | { readonly ok: true; readonly value: TrimLoop3D };

const DUP_EPS = 1e-4;

export const computeNewellNormal = (
  points: readonly TrimLoop3DPoint[]
): readonly [number, number, number] | undefined => {
  if (points.length < 3) return undefined;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i]!;
    const nxt = points[(i + 1) % points.length]!;
    nx += (cur.y - nxt.y) * (cur.z + nxt.z);
    ny += (cur.z - nxt.z) * (cur.x + nxt.x);
    nz += (cur.x - nxt.x) * (cur.y + nxt.y);
  }
  const len = Math.hypot(nx, ny, nz);
  if (!Number.isFinite(len) || len < 1e-10) return undefined;
  return Object.freeze([nx / len, ny / len, nz / len] as const);
};

const dedupePoints = (points: readonly TrimLoop3DPoint[]): TrimLoop3DPoint[] => {
  const out: TrimLoop3DPoint[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (
      prev !== undefined &&
      Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) <= DUP_EPS
    ) {
      continue;
    }
    out.push(p);
  }
  if (out.length >= 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) <= DUP_EPS) {
      out.pop();
    }
  }
  return out;
};

const planarityRms = (
  points: readonly TrimLoop3DPoint[],
  normal: readonly [number, number, number]
): number => {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  const n = points.length;
  cx /= n;
  cy /= n;
  cz /= n;
  let sum = 0;
  for (const p of points) {
    const d = (p.x - cx) * normal[0] + (p.y - cy) * normal[1] + (p.z - cz) * normal[2];
    sum += d * d;
  }
  return Math.sqrt(sum / n);
};

const projectedArea = (
  points: readonly TrimLoop3DPoint[],
  normal: readonly [number, number, number]
): number => {
  const n = normal;
  const helper: [number, number, number] =
    Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const ux = n[1] * helper[2] - n[2] * helper[1];
  const uy = n[2] * helper[0] - n[0] * helper[2];
  const uz = n[0] * helper[1] - n[1] * helper[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  const u: [number, number, number] = [ux / ul, uy / ul, uz / ul];
  const v: [number, number, number] = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0]
  ];
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const ax = a.x * u[0] + a.y * u[1] + a.z * u[2];
    const ay = a.x * v[0] + a.y * v[1] + a.z * v[2];
    const bx = b.x * u[0] + b.y * u[1] + b.z * u[2];
    const by = b.x * v[0] + b.y * v[1] + b.z * v[2];
    area += ax * by - bx * ay;
  }
  return Math.abs(area) * 0.5;
};

/** Non-adjacent segment self-intersection in the loop plane. */
export const loop3dSelfIntersects = (
  points: readonly TrimLoop3DPoint[],
  normal: readonly [number, number, number]
): boolean => {
  if (points.length < 4) return false;
  const n = normal;
  const helper: [number, number, number] =
    Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let ux = n[1] * helper[2] - n[2] * helper[1];
  let uy = n[2] * helper[0] - n[0] * helper[2];
  let uz = n[0] * helper[1] - n[1] * helper[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = n[1] * uz - n[2] * uy;
  const vy = n[2] * ux - n[0] * uz;
  const vz = n[0] * uy - n[1] * ux;
  const pts2 = points.map((p) => ({
    x: p.x * ux + p.y * uy + p.z * uz,
    y: p.x * vx + p.y * vy + p.z * vz
  }));
  const orient = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number }
  ): number => (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  const crosses = (
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number }
  ): boolean => {
    const o1 = orient(a1, a2, b1);
    const o2 = orient(a1, a2, b2);
    const o3 = orient(b1, b2, a1);
    const o4 = orient(b1, b2, a2);
    return o1 * o2 < 0 && o3 * o4 < 0;
  };
  const m = pts2.length;
  for (let i = 0; i < m; i += 1) {
    const a1 = pts2[i]!;
    const a2 = pts2[(i + 1) % m]!;
    for (let j = i + 1; j < m; j += 1) {
      if ((i + 1) % m === j || (j + 1) % m === i) continue;
      if (i === 0 && j === m - 1) continue;
      if (j === 0 && i === m - 1) continue;
      const b1 = pts2[j]!;
      const b2 = pts2[(j + 1) % m]!;
      if (crosses(a1, a2, b1, b2)) return true;
    }
  }
  return false;
};

export const boundaryToLoop3dPoints = (
  points: readonly TrimBoundaryPoint[]
): TrimLoop3DPoint[] | undefined => {
  const out: TrimLoop3DPoint[] = [];
  // Prefer mesh-local 3D (matches MeshRegistry buffers). World XYZ diverge after orientation.
  const useLocal = points.every(
    (p) =>
      typeof p.localX === 'number' &&
      typeof p.localY === 'number' &&
      typeof p.localZ === 'number' &&
      Number.isFinite(p.localX) &&
      Number.isFinite(p.localY) &&
      Number.isFinite(p.localZ)
  );
  for (const p of points) {
    if (useLocal) {
      out.push({ x: p.localX!, y: p.localY!, z: p.localZ! });
      continue;
    }
    if (
      typeof p.worldX !== 'number' ||
      typeof p.worldY !== 'number' ||
      typeof p.worldZ !== 'number' ||
      !Number.isFinite(p.worldX) ||
      !Number.isFinite(p.worldY) ||
      !Number.isFinite(p.worldZ)
    ) {
      return undefined;
    }
    out.push({ x: p.worldX, y: p.worldY, z: p.worldZ });
  }
  return out;
};

/**
 * Build a validated production Trim loop from surface-picked world points.
 */
export const buildClinicalTrimLoop3d = (
  boundaryPoints: readonly TrimBoundaryPoint[],
  keepMode: ClinicalTrimKeepMode = 'KEEP_OUTSIDE'
): TrimLoop3DFailure => {
  const raw = boundaryToLoop3dPoints(boundaryPoints);
  if (raw === undefined) {
    return {
      ok: false,
      message: 'Trim requires surface-picked 3D boundary points (world X/Y/Z).'
    };
  }
  const points = dedupePoints(raw);
  if (points.length < MIN_BOUNDARY_POINTS) {
    return {
      ok: false,
      message: `Trim boundary requires ≥ ${String(MIN_BOUNDARY_POINTS)} distinct 3D points.`
    };
  }
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      return { ok: false, message: 'Trim boundary contains non-finite coordinates.' };
    }
  }
  const normal = computeNewellNormal(points);
  if (normal === undefined) {
    return { ok: false, message: 'Trim boundary orientation could not be determined.' };
  }
  const area = projectedArea(points, normal);
  if (area < 1e-8) {
    return { ok: false, message: 'Trim boundary area is degenerate.' };
  }
  // GEO-001C: planar Newell self-intersection is not authoritative on curved dental
  // surfaces (false positives after densified SurfacePath). SurfacePath validation
  // (local tangent / geodesic) is the gate — do not reject here.
  return {
    ok: true,
    value: Object.freeze({
      points: Object.freeze(points.map((p) => Object.freeze({ ...p }))),
      normal,
      keepMode,
      areaEstimate: area,
      planarityRms: planarityRms(points, normal)
    })
  };
};

/** Map clinical keepMode → VTK InsideOut (PROD-001S empirical). */
export const keepModeToVtkInsideOut = (keepMode: ClinicalTrimKeepMode): boolean =>
  keepMode === 'KEEP_INSIDE';
