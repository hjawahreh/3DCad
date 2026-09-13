/**
 * GEO-001 / GEO-001C — SurfacePath (authoritative 3D surface-associated path).
 *
 * Pointer samples → surface hits → SurfacePath → validated closed SurfacePath.
 * Do not weaken DISCONNECTED_PATH validation.
 */

import { fingerprintMesh, type TriangleMesh } from '../mesh/TriangleMesh.js';
import { buildTopology, shortestFacePath } from './TopologyGraph.js';
import {
  buildClinicalSpatialIndex,
  nearestSurfacePoint,
  projectPointToSurface,
  type ClinicalSpatialIndex
} from './SpatialAcceleration.js';
import type { SurfacePath, SurfacePathSample } from './types.js';

export interface SurfacePathQualityMetrics {
  readonly pointCount: number;
  readonly uniquePointCount: number;
  readonly perimeter: number;
  readonly minimumSegmentLength: number;
  readonly maximumSegmentLength: number;
  readonly meanSegmentLength: number;
  readonly selfIntersectionCount: number;
  readonly componentCount: number;
  readonly enclosedRegionEstimate: number;
}

const pathFingerprint = (samples: readonly SurfacePathSample[], closed: boolean): string => {
  const positions = new Float32Array(samples.length * 3);
  const indices = new Uint32Array(Math.max(0, samples.length - (closed ? 0 : 1)) * 2);
  for (let i = 0; i < samples.length; i += 1) {
    positions[i * 3] = samples[i]!.point[0];
    positions[i * 3 + 1] = samples[i]!.point[1];
    positions[i * 3 + 2] = samples[i]!.point[2];
  }
  let k = 0;
  for (let i = 0; i < samples.length - 1; i += 1) {
    indices[k++] = i;
    indices[k++] = i + 1;
  }
  if (closed && samples.length >= 3) {
    const grow = new Uint32Array(indices.length + 2);
    grow.set(indices);
    grow[indices.length] = samples.length - 1;
    grow[indices.length + 1] = 0;
    return fingerprintMesh(positions, grow, 'spath:');
  }
  return fingerprintMesh(positions, indices, 'spath:');
};

const pathLength = (samples: readonly SurfacePathSample[], closed: boolean): number => {
  let len = 0;
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i]!.point;
    const b = samples[i + 1]!.point;
    len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  if (closed && samples.length >= 3) {
    const a = samples[samples.length - 1]!.point;
    const b = samples[0]!.point;
    len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return len;
};

const dist3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

const faceCenter = (mesh: TriangleMesh, faceId: number): readonly [number, number, number] => {
  const i0 = mesh.indices[faceId * 3]!;
  const i1 = mesh.indices[faceId * 3 + 1]!;
  const i2 = mesh.indices[faceId * 3 + 2]!;
  return [
    (mesh.positions[i0 * 3]! + mesh.positions[i1 * 3]! + mesh.positions[i2 * 3]!) / 3,
    (mesh.positions[i0 * 3 + 1]! + mesh.positions[i1 * 3 + 1]! + mesh.positions[i2 * 3 + 1]!) / 3,
    (mesh.positions[i0 * 3 + 2]! + mesh.positions[i1 * 3 + 2]! + mesh.positions[i2 * 3 + 2]!) / 3
  ];
};

const faceEdgeLengthHint = (mesh: TriangleMesh, faceId: number): number => {
  const i0 = mesh.indices[faceId * 3]!;
  const i1 = mesh.indices[faceId * 3 + 1]!;
  const i2 = mesh.indices[faceId * 3 + 2]!;
  const p = mesh.positions;
  const e01 = Math.hypot(
    p[i1 * 3]! - p[i0 * 3]!,
    p[i1 * 3 + 1]! - p[i0 * 3 + 1]!,
    p[i1 * 3 + 2]! - p[i0 * 3 + 2]!
  );
  const e12 = Math.hypot(
    p[i2 * 3]! - p[i1 * 3]!,
    p[i2 * 3 + 1]! - p[i1 * 3 + 1]!,
    p[i2 * 3 + 2]! - p[i1 * 3 + 2]!
  );
  const e20 = Math.hypot(
    p[i0 * 3]! - p[i2 * 3]!,
    p[i0 * 3 + 1]! - p[i2 * 3 + 1]!,
    p[i0 * 3 + 2]! - p[i2 * 3 + 2]!
  );
  return (e01 + e12 + e20) / 3;
};

/** Adaptive model-space sample spacing from local triangle scale (clamped). */
export const adaptiveSampleSpacingMm = (
  mesh: TriangleMesh,
  faceId: number,
  baseMm = 0.35
): number => {
  const edge = faceEdgeLengthHint(mesh, faceId);
  // Dense mesh → keep near base; coarse mesh → allow slightly larger steps.
  const fromEdge = Math.max(0.2, Math.min(1.25, edge * 0.35));
  return Math.max(0.2, Math.min(1.25, (baseMm + fromEdge) * 0.5));
};

const makeSample = (
  hit: {
    readonly point: readonly [number, number, number];
    readonly normal: readonly [number, number, number];
    readonly faceId: number;
    readonly componentId: number;
  }
): SurfacePathSample => ({
  point: hit.point,
  normal: hit.normal,
  faceId: hit.faceId,
  componentId: hit.componentId
});

const projectLerpOnSurface = (
  mesh: TriangleMesh,
  spatial: ClinicalSpatialIndex,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
  maxDist: number
): SurfacePathSample | undefined => {
  const point: readonly [number, number, number] = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
  const hit = projectPointToSurface(mesh, point, spatial, maxDist);
  if (!hit.hit) {
    const near = nearestSurfacePoint(mesh, point, spatial, maxDist * 2);
    if (!near.hit) return undefined;
    return makeSample(near);
  }
  return makeSample(hit);
};

/**
 * Reconstruct a surface geodesic between two samples (face dual Dijkstra).
 * Densifies so consecutive samples stay within adaptive spacing.
 */
export const reconstructSurfaceSegment = (
  mesh: TriangleMesh,
  from: SurfacePathSample,
  to: SurfacePathSample,
  maxJumpMm = 2.5
): SurfacePathSample[] | undefined => {
  const direct = dist3(from.point, to.point);
  if (from.componentId !== to.componentId) {
    return undefined;
  }
  const topology = buildTopology(mesh);
  if (topology.components[from.faceId] !== topology.components[to.faceId]) {
    return undefined;
  }

  const spatial = buildClinicalSpatialIndex(mesh);
  const spacing = Math.min(
    adaptiveSampleSpacingMm(mesh, from.faceId),
    adaptiveSampleSpacingMm(mesh, to.faceId)
  );

  // Short chord is OK only when already on-surface proximity is small.
  if (direct <= Math.max(maxJumpMm, spacing * 2)) {
    return densifyChordOnSurface(mesh, spatial, [from, to], spacing, 8);
  }

  const faces = shortestFacePath(topology, mesh, from.faceId, to.faceId);
  if (faces === undefined || faces.length === 0) return undefined;

  const anchors: SurfacePathSample[] = [from];
  for (let i = 1; i < faces.length - 1; i += 1) {
    const faceId = faces[i]!;
    const center = faceCenter(mesh, faceId);
    const hit = projectPointToSurface(mesh, center, spatial, 8);
    if (!hit.hit) continue;
    if (hit.componentId !== from.componentId) continue;
    anchors.push(makeSample(hit));
  }
  anchors.push(to);

  return densifyChordOnSurface(mesh, spatial, anchors, spacing, 12);
};

/** Insert on-surface samples along polyline anchors so max gap ≤ spacing. */
const densifyChordOnSurface = (
  mesh: TriangleMesh,
  spatial: ClinicalSpatialIndex,
  anchors: readonly SurfacePathSample[],
  spacingMm: number,
  maxDist: number
): SurfacePathSample[] | undefined => {
  if (anchors.length < 2) return anchors.length === 1 ? [...anchors] : undefined;
  const out: SurfacePathSample[] = [anchors[0]!];
  for (let i = 1; i < anchors.length; i += 1) {
    const a = out[out.length - 1]!;
    const b = anchors[i]!;
    if (a.componentId !== b.componentId) return undefined;
    const segLen = dist3(a.point, b.point);
    if (segLen < 1e-9) continue;
    const steps = Math.max(1, Math.ceil(segLen / Math.max(0.15, spacingMm)));
    for (let s = 1; s < steps; s += 1) {
      const sample = projectLerpOnSurface(mesh, spatial, a.point, b.point, s / steps, maxDist);
      if (sample === undefined) continue;
      if (sample.componentId !== a.componentId) return undefined;
      const last = out[out.length - 1]!;
      if (dist3(last.point, sample.point) < spacingMm * 0.25) continue;
      out.push(sample);
    }
    const last = out[out.length - 1]!;
    if (dist3(last.point, b.point) > 1e-6) {
      out.push(b);
    }
  }
  return out;
};

export type SurfacePathReconstructMode = boolean | 'always' | 'gaps' | 'never';

export const createSurfacePath = (
  mesh: TriangleMesh,
  seeds: readonly {
    readonly point: readonly [number, number, number];
    readonly faceId?: number;
    readonly normal?: readonly [number, number, number];
  }[],
  options?: {
    readonly closed?: boolean;
    readonly reconstruct?: SurfacePathReconstructMode;
    readonly sampleMm?: number;
    readonly maxProjectDistanceMm?: number;
    readonly maxJumpMm?: number;
  }
): { ok: true; path: SurfacePath } | { ok: false; code: string; message: string } => {
  if (seeds.length < 1) {
    return { ok: false, code: 'EMPTY_PATH', message: 'Surface path requires at least one seed' };
  }
  const spatial = buildClinicalSpatialIndex(mesh);
  const maxDist = options?.maxProjectDistanceMm ?? 12;
  const maxJump = options?.maxJumpMm ?? 2.5;
  const projected: SurfacePathSample[] = [];
  for (const seed of seeds) {
    const hit = projectPointToSurface(mesh, seed.point, spatial, maxDist);
    if (!hit.hit) {
      return {
        ok: false,
        code: 'OFF_SURFACE',
        message: 'Move onto the scan to draw.'
      };
    }
    projected.push({
      point: hit.point,
      normal: seed.normal ?? hit.normal,
      faceId: seed.faceId !== undefined && seed.faceId >= 0 ? seed.faceId : hit.faceId,
      componentId: hit.componentId
    });
  }

  // Safe repair: drop exact consecutive duplicates.
  const cleaned: SurfacePathSample[] = [];
  for (const s of projected) {
    const prev = cleaned[cleaned.length - 1];
    if (prev !== undefined && dist3(prev.point, s.point) < 1e-7) continue;
    cleaned.push(s);
  }
  if (cleaned.length < 1) {
    return { ok: false, code: 'EMPTY_PATH', message: 'Surface path requires at least one seed' };
  }

  const mode = options?.reconstruct;
  const reconstructAlways = mode === true || mode === 'always' || mode === undefined;
  const reconstructGaps = mode === 'gaps';
  const reconstructNever = mode === false || mode === 'never';

  let samples: SurfacePathSample[] = [];
  if (reconstructNever || cleaned.length === 1) {
    samples = cleaned;
  } else {
    samples = [cleaned[0]!];
    for (let i = 1; i < cleaned.length; i += 1) {
      const prev = cleaned[i - 1]!;
      const cur = cleaned[i]!;
      const gap = dist3(prev.point, cur.point);
      const spacing = adaptiveSampleSpacingMm(mesh, prev.faceId, options?.sampleMm ?? 0.35);
      const needGeodesic =
        reconstructAlways || (reconstructGaps && gap > Math.max(maxJump, spacing * 2.5));
      if (!needGeodesic) {
        const densified = densifyChordOnSurface(mesh, spatial, [prev, cur], spacing, maxDist);
        if (densified === undefined) {
          return {
            ok: false,
            code: 'DISCONNECTED_PATH',
            message: 'Trim boundary crossed disconnected scan geometry.'
          };
        }
        samples.push(...densified.slice(1));
        continue;
      }
      const seg = reconstructSurfaceSegment(mesh, prev, cur, maxJump);
      if (seg === undefined) {
        return {
          ok: false,
          code: 'DISCONNECTED_PATH',
          message: 'Trim boundary crossed disconnected scan geometry.'
        };
      }
      samples.push(...seg.slice(1));
    }
  }

  const closed = options?.closed === true;
  let path: SurfacePath = {
    samples,
    length: pathLength(samples, false),
    closed: false,
    fingerprint: pathFingerprint(samples, false),
    meshFingerprint: mesh.fingerprint
  };

  if (closed) {
    const closedResult = closeSurfacePath(mesh, path, { maxJumpMm: maxJump, maxProjectDistanceMm: maxDist });
    if (!closedResult.ok) return closedResult;
    path = closedResult.path;
  }

  return { ok: true, path };
};

export const validateSurfacePath = (
  mesh: TriangleMesh,
  path: SurfacePath,
  options?: { readonly minSamples?: number; readonly maxSpacingMm?: number; readonly minLengthMm?: number }
): { ok: true } | { ok: false; code: string; message: string } => {
  if (path.meshFingerprint !== mesh.fingerprint) {
    return { ok: false, code: 'STALE_GEOMETRY', message: 'Surface path fingerprint does not match mesh' };
  }
  const minSamples = options?.minSamples ?? (path.closed ? 3 : 2);
  if (path.samples.length < minSamples) {
    return { ok: false, code: 'TOO_FEW_SAMPLES', message: `Surface path needs ≥${String(minSamples)} samples` };
  }
  const topology = buildTopology(mesh);
  const component0 = path.samples[0]!.componentId;
  let maxSeg = 0;
  for (let i = 0; i < path.samples.length; i += 1) {
    const s = path.samples[i]!;
    for (const c of s.point) {
      if (!Number.isFinite(c)) {
        return { ok: false, code: 'NON_FINITE', message: 'Surface path contains non-finite coordinates' };
      }
    }
    if (s.faceId < 0 || s.faceId >= topology.faceCount) {
      return { ok: false, code: 'INVALID_FACE', message: 'Surface path references invalid faceId' };
    }
    if (s.componentId !== component0) {
      return {
        ok: false,
        code: 'DISCONNECTED_PATH',
        message: 'Trim boundary crossed disconnected scan geometry.'
      };
    }
    if (i > 0) {
      const prev = path.samples[i - 1]!;
      const d = dist3(prev.point, s.point);
      if (d < 1e-7) {
        return { ok: false, code: 'DUPLICATE_SAMPLE', message: 'Duplicate consecutive surface samples' };
      }
      maxSeg = Math.max(maxSeg, d);
      const maxSpacing = options?.maxSpacingMm ?? 8;
      if (d > maxSpacing) {
        return {
          ok: false,
          code: 'EXCESSIVE_JUMP',
          message: 'Trim boundary could not follow the scan surface between points.'
        };
      }
    }
  }
  if (path.closed && path.samples.length >= 3) {
    const closing = dist3(path.samples[path.samples.length - 1]!.point, path.samples[0]!.point);
    maxSeg = Math.max(maxSeg, closing);
    const maxSpacing = options?.maxSpacingMm ?? 8;
    if (closing > maxSpacing) {
      return {
        ok: false,
        code: 'INVALID_CLOSURE',
        message: 'Trim boundary could not be closed along the scan surface.'
      };
    }
  }
  const minLength = options?.minLengthMm ?? 0.5;
  if (path.length < minLength) {
    return { ok: false, code: 'TOO_SHORT', message: 'Trim boundary is too short.' };
  }
  if (path.closed) {
    const unique = new Set(
      path.samples.map(
        (s) => `${s.point[0].toFixed(4)}:${s.point[1].toFixed(4)}:${s.point[2].toFixed(4)}`
      )
    );
    if (unique.size < 3) {
      return { ok: false, code: 'TOO_FEW_UNIQUE', message: 'Closed surface path needs ≥3 unique samples' };
    }
    const crosses = countSelfIntersections(path);
    if (crosses > 0) {
      return {
        ok: false,
        code: 'SELF_INTERSECTS',
        message: 'Trim boundary crosses itself. Adjust the drawing.'
      };
    }
  }
  return { ok: true };
};

/** Newell normal for local tangent-plane self-intersection tests. */
const pathNewellNormal = (
  samples: readonly SurfacePathSample[]
): readonly [number, number, number] | undefined => {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const a = samples[i]!.point;
    const b = samples[(i + 1) % samples.length]!.point;
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return undefined;
  return [nx / len, ny / len, nz / len];
};

const projectToTangent2d = (
  point: readonly [number, number, number],
  origin: readonly [number, number, number],
  normal: readonly [number, number, number]
): { x: number; y: number } => {
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  const dz = point[2] - origin[2];
  // Build orthonormal tangent basis from normal.
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  const helper: readonly [number, number, number] =
    ax < ay && ax < az ? [1, 0, 0] : ay < az ? [0, 1, 0] : [0, 0, 1];
  const tx = normal[1] * helper[2] - normal[2] * helper[1];
  const ty = normal[2] * helper[0] - normal[0] * helper[2];
  const tz = normal[0] * helper[1] - normal[1] * helper[0];
  const tLen = Math.hypot(tx, ty, tz) || 1;
  const t0: readonly [number, number, number] = [tx / tLen, ty / tLen, tz / tLen];
  const b0: readonly [number, number, number] = [
    normal[1] * t0[2] - normal[2] * t0[1],
    normal[2] * t0[0] - normal[0] * t0[2],
    normal[0] * t0[1] - normal[1] * t0[0]
  ];
  return { x: dx * t0[0] + dy * t0[1] + dz * t0[2], y: dx * b0[0] + dy * b0[1] + dz * b0[2] };
};

export const countSelfIntersections = (path: SurfacePath): number => {
  const pts = path.samples;
  if (pts.length < 4) return 0;
  const normal = pathNewellNormal(pts) ?? ([0, 0, 1] as const);
  const origin = pts[0]!.point;
  const pts2 = pts.map((s) => projectToTangent2d(s.point, origin, normal));
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
  let count = 0;
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
      if (crosses(a1, a2, b1, b2)) count += 1;
    }
  }
  return count;
};

const pathSelfIntersects = (path: SurfacePath): boolean => countSelfIntersections(path) > 0;

/**
 * Surface-aware resampling: densify via on-surface projection; reconstruct gaps.
 */
export const resampleSurfacePath = (
  mesh: TriangleMesh,
  path: SurfacePath,
  spacingMm = 0.35
): SurfacePath => {
  if (path.samples.length < 2 || !(spacingMm > 0)) return path;
  const spatial = buildClinicalSpatialIndex(mesh);
  const densified = densifyChordOnSurface(mesh, spatial, path.samples, spacingMm, 12);
  if (densified === undefined || densified.length < 2) return path;
  // Fill remaining large gaps with geodesic reconstruction.
  const out: SurfacePathSample[] = [densified[0]!];
  for (let i = 1; i < densified.length; i += 1) {
    const prev = out[out.length - 1]!;
    const cur = densified[i]!;
    const gap = dist3(prev.point, cur.point);
    if (gap > spacingMm * 3) {
      const seg = reconstructSurfaceSegment(mesh, prev, cur, spacingMm * 2);
      if (seg !== undefined) {
        out.push(...seg.slice(1));
        continue;
      }
    }
    out.push(cur);
  }
  return {
    samples: out,
    length: pathLength(out, path.closed),
    closed: path.closed,
    fingerprint: pathFingerprint(out, path.closed),
    meshFingerprint: mesh.fingerprint
  };
};

/**
 * Thin a dense SurfacePath to a minimum spacing while keeping endpoints.
 * Used before VTK so SelectPolyData stays responsive on real dental meshes.
 */
export const thinSurfacePath = (
  path: SurfacePath,
  minSpacingMm = 1.0,
  maxSamples = 160
): SurfacePath => {
  if (path.samples.length <= 4) return path;
  const out: SurfacePathSample[] = [path.samples[0]!];
  for (let i = 1; i < path.samples.length - 1; i += 1) {
    const prev = out[out.length - 1]!;
    const cur = path.samples[i]!;
    if (dist3(prev.point, cur.point) >= minSpacingMm) {
      out.push(cur);
    }
  }
  const last = path.samples[path.samples.length - 1]!;
  if (dist3(out[out.length - 1]!.point, last.point) > 1e-6) {
    out.push(last);
  }
  if (out.length > maxSamples) {
    const step = (out.length - 1) / (maxSamples - 1);
    const reduced: SurfacePathSample[] = [];
    for (let i = 0; i < maxSamples; i += 1) {
      const idx = Math.min(out.length - 1, Math.round(i * step));
      const sample = out[idx]!;
      if (reduced.length === 0 || dist3(reduced[reduced.length - 1]!.point, sample.point) > 1e-6) {
        reduced.push(sample);
      }
    }
    if (reduced[reduced.length - 1] !== out[out.length - 1]) {
      reduced.push(out[out.length - 1]!);
    }
    return {
      samples: reduced,
      length: pathLength(reduced, path.closed),
      closed: path.closed,
      fingerprint: pathFingerprint(reduced, path.closed),
      meshFingerprint: path.meshFingerprint
    };
  }
  return {
    samples: out,
    length: pathLength(out, path.closed),
    closed: path.closed,
    fingerprint: pathFingerprint(out, path.closed),
    meshFingerprint: path.meshFingerprint
  };
};

/**
 * Limited surface-aware simplification — remove only near-collinear on-surface points.
 * Never removes anchors that would create a gap larger than maxGapMm without geodesic.
 */
export const simplifySurfacePath = (
  mesh: TriangleMesh,
  path: SurfacePath,
  options?: {
    readonly maxDeviationMm?: number;
    readonly maxNormalDotLoss?: number;
    readonly minSpacingMm?: number;
  }
): SurfacePath => {
  if (path.samples.length <= 3) return path;
  const maxDev = options?.maxDeviationMm ?? 0.2;
  const minSpacing = options?.minSpacingMm ?? 0.25;
  const maxNormalLoss = options?.maxNormalDotLoss ?? 0.08;
  const keep = new Array<boolean>(path.samples.length).fill(true);
  for (let i = 1; i < path.samples.length - 1; i += 1) {
    const a = path.samples[i - 1]!;
    const b = path.samples[i]!;
    const c = path.samples[i + 1]!;
    const ab = dist3(a.point, b.point);
    const bc = dist3(b.point, c.point);
    if (ab + bc < minSpacing * 2) {
      // Candidate for removal only if geometrically flat.
      const ac = dist3(a.point, c.point);
      const deviation = Math.abs(ab + bc - ac);
      const na = b.normal;
      const nb = c.normal;
      let normalOk = true;
      if (na !== undefined && nb !== undefined) {
        const dot = na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2];
        normalOk = 1 - dot <= maxNormalLoss;
      }
      if (deviation <= maxDev && normalOk) {
        keep[i] = false;
      }
    }
  }
  const samples = path.samples.filter((_, i) => keep[i]);
  if (samples.length < 3) return path;
  // Ensure result stays connected on surface.
  const spatial = buildClinicalSpatialIndex(mesh);
  const densified = densifyChordOnSurface(
    mesh,
    spatial,
    samples,
    adaptiveSampleSpacingMm(mesh, samples[0]!.faceId),
    12
  );
  const finalSamples = densified ?? samples;
  return {
    samples: finalSamples,
    length: pathLength(finalSamples, path.closed),
    closed: path.closed,
    fingerprint: pathFingerprint(finalSamples, path.closed),
    meshFingerprint: mesh.fingerprint
  };
};

export const closeSurfacePath = (
  mesh: TriangleMesh,
  path: SurfacePath,
  options?: { readonly maxJumpMm?: number; readonly maxProjectDistanceMm?: number }
): { ok: true; path: SurfacePath } | { ok: false; code: string; message: string } => {
  if (path.closed) return { ok: true, path };
  if (path.samples.length < 3) {
    return { ok: false, code: 'TOO_FEW_SAMPLES', message: 'Add at least 3 points before closing.' };
  }
  const first = path.samples[0]!;
  const last = path.samples[path.samples.length - 1]!;
  if (first.componentId !== last.componentId) {
    return {
      ok: false,
      code: 'DISCONNECTED_PATH',
      message: 'Trim boundary crossed disconnected scan geometry.'
    };
  }
  const gap = dist3(last.point, first.point);
  const spacing = adaptiveSampleSpacingMm(mesh, last.faceId);
  let samples = [...path.samples];
  if (gap > 1e-6) {
    const seg = reconstructSurfaceSegment(mesh, last, first, options?.maxJumpMm ?? 2.5);
    if (seg === undefined) {
      return {
        ok: false,
        code: 'INVALID_CLOSURE',
        message: 'Trim boundary could not be closed along the scan surface.'
      };
    }
    // Append closing route without duplicating first/last endpoints.
    const mid = seg.slice(1, -1);
    // If closing is short, densify chord instead of full mid list.
    if (mid.length === 0 && gap > spacing) {
      const spatial = buildClinicalSpatialIndex(mesh);
      const densified = densifyChordOnSurface(mesh, spatial, [last, first], spacing, options?.maxProjectDistanceMm ?? 12);
      if (densified === undefined) {
        return {
          ok: false,
          code: 'INVALID_CLOSURE',
          message: 'Trim boundary could not be closed along the scan surface.'
        };
      }
      samples = [...path.samples, ...densified.slice(1, -1)];
    } else {
      samples = [...path.samples, ...mid];
    }
  }
  const closedPath: SurfacePath = {
    samples,
    length: pathLength(samples, true),
    closed: true,
    fingerprint: pathFingerprint(samples, true),
    meshFingerprint: mesh.fingerprint
  };
  if (pathSelfIntersects(closedPath)) {
    return {
      ok: false,
      code: 'SELF_INTERSECTS',
      message: 'Trim boundary crosses itself. Adjust the drawing.'
    };
  }
  return { ok: true, path: closedPath };
};

export const measureSurfacePath = (
  path: SurfacePath
): { length: number; sampleCount: number; closed: boolean } => ({
  length: path.length,
  sampleCount: path.samples.length,
  closed: path.closed
});

export const measureSurfacePathQuality = (path: SurfacePath): SurfacePathQualityMetrics => {
  const segs: number[] = [];
  for (let i = 0; i < path.samples.length - 1; i += 1) {
    segs.push(dist3(path.samples[i]!.point, path.samples[i + 1]!.point));
  }
  if (path.closed && path.samples.length >= 3) {
    segs.push(dist3(path.samples[path.samples.length - 1]!.point, path.samples[0]!.point));
  }
  const unique = new Set(
    path.samples.map(
      (s) => `${s.point[0].toFixed(4)}:${s.point[1].toFixed(4)}:${s.point[2].toFixed(4)}`
    )
  );
  const components = new Set(path.samples.map((s) => s.componentId));
  const normal = pathNewellNormal(path.samples);
  let enclosed = 0;
  if (normal !== undefined && path.samples.length >= 3) {
    const origin = path.samples[0]!.point;
    const pts2 = path.samples.map((s) => projectToTangent2d(s.point, origin, normal));
    for (let i = 0, j = pts2.length - 1; i < pts2.length; j = i++) {
      enclosed += (pts2[j]!.x + pts2[i]!.x) * (pts2[j]!.y - pts2[i]!.y);
    }
    enclosed = Math.abs(enclosed) * 0.5;
  }
  const sum = segs.reduce((a, b) => a + b, 0);
  return {
    pointCount: path.samples.length,
    uniquePointCount: unique.size,
    perimeter: path.length,
    minimumSegmentLength: segs.length === 0 ? 0 : Math.min(...segs),
    maximumSegmentLength: segs.length === 0 ? 0 : Math.max(...segs),
    meanSegmentLength: segs.length === 0 ? 0 : sum / segs.length,
    selfIntersectionCount: path.closed ? countSelfIntersections(path) : 0,
    componentCount: components.size,
    enclosedRegionEstimate: enclosed
  };
};

/** Map SurfacePath failure codes to concise clinical UI copy. */
export const clinicalSurfacePathMessage = (code: string, fallback: string): string => {
  switch (code) {
    case 'OFF_SURFACE':
      return 'Move onto the scan to draw.';
    case 'DISCONNECTED_PATH':
      return 'Trim boundary crossed disconnected scan geometry.';
    case 'SELF_INTERSECTS':
      return 'Trim boundary crosses itself. Adjust the drawing.';
    case 'INVALID_CLOSURE':
      return 'Trim boundary could not be closed along the scan surface.';
    case 'EXCESSIVE_JUMP':
      return 'Trim boundary could not follow the scan surface between points.';
    case 'TOO_SHORT':
    case 'TOO_FEW_SAMPLES':
    case 'TOO_FEW_UNIQUE':
      return 'Add more surface points to complete the trim boundary.';
    case 'NO_REGION':
      return 'Trim boundary does not enclose removable surface.';
    default:
      return fallback;
  }
};
