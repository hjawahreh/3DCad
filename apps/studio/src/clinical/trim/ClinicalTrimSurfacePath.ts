/**
 * GEO-001C — Trim ↔ authoritative SurfacePath bridge.
 * Screen/stroke points remain interaction input; SurfacePath is the geometry authority.
 */

import type { TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import {
  adaptiveSampleSpacingMm,
  clinicalSurfacePathMessage,
  closeSurfacePath,
  createSurfacePath,
  measureSurfacePathQuality,
  simplifySurfacePath,
  validateSurfacePath,
  type SurfacePathReconstructMode
} from '../../geometry-kernel/engine/index.js';
import type { SurfacePath } from '../../geometry-kernel/engine/types.js';
import type { TrimDrawMode } from './ClinicalTrimState.js';
import type { TrimBoundaryPoint } from './ClinicalTrimBoundaryMath.js';

export const reconstructModeForDraw = (mode: TrimDrawMode): SurfacePathReconstructMode => {
  if (mode === 'polyline') return 'always';
  if (mode === 'freehand') return 'gaps';
  return 'gaps';
};

export const seedsFromBoundaryPoints = (
  points: readonly TrimBoundaryPoint[]
):
  | {
      readonly ok: true;
      readonly seeds: readonly {
        readonly point: readonly [number, number, number];
        readonly faceId?: number;
        readonly normal?: readonly [number, number, number];
      }[];
    }
  | { readonly ok: false; readonly message: string } => {
  const seeds: {
    point: readonly [number, number, number];
    faceId?: number;
    normal?: readonly [number, number, number];
  }[] = [];
  for (const p of points) {
    if (
      typeof p.localX !== 'number' ||
      typeof p.localY !== 'number' ||
      typeof p.localZ !== 'number' ||
      !Number.isFinite(p.localX) ||
      !Number.isFinite(p.localY) ||
      !Number.isFinite(p.localZ)
    ) {
      return {
        ok: false,
        message: 'Move onto the scan to draw.'
      };
    }
    const seed: {
      point: readonly [number, number, number];
      faceId?: number;
      normal?: readonly [number, number, number];
    } = {
      point: [p.localX, p.localY, p.localZ]
    };
    if (typeof p.faceId === 'number' && p.faceId >= 0) {
      seed.faceId = p.faceId;
    }
    if (
      typeof p.normalX === 'number' &&
      typeof p.normalY === 'number' &&
      typeof p.normalZ === 'number' &&
      Number.isFinite(p.normalX) &&
      Number.isFinite(p.normalY) &&
      Number.isFinite(p.normalZ)
    ) {
      seed.normal = [p.normalX, p.normalY, p.normalZ];
    }
    seeds.push(seed);
  }
  return { ok: true, seeds };
};

/** Lightweight freehand acceptance spacing from local mesh density. */
export const freehandMinSpacingMm = (
  mesh: TriangleMesh | undefined,
  last: TrimBoundaryPoint | undefined
): number => {
  if (mesh === undefined || last?.faceId === undefined || last.faceId < 0) {
    return 0.35;
  }
  return adaptiveSampleSpacingMm(mesh, last.faceId, 0.35);
};

export const tryConnectPolylineAnchors = (
  mesh: TriangleMesh,
  from: TrimBoundaryPoint,
  to: TrimBoundaryPoint
): { ok: true } | { ok: false; message: string } => {
  const seeds = seedsFromBoundaryPoints([from, to]);
  if (!seeds.ok) {
    return { ok: false, message: seeds.message };
  }
  const built = createSurfacePath(mesh, seeds.seeds, {
    closed: false,
    reconstruct: 'always',
    maxProjectDistanceMm: 12,
    maxJumpMm: 2.5
  });
  if (!built.ok) {
    if (
      built.code === 'DISCONNECTED_PATH' ||
      built.code === 'EXCESSIVE_JUMP' ||
      built.code === 'OFF_SURFACE'
    ) {
      return { ok: false, message: 'Unable to connect these surface points.' };
    }
    return {
      ok: false,
      message: clinicalSurfacePathMessage(built.code, built.message)
    };
  }
  return { ok: true };
};

export const buildAuthoritativeClosedSurfacePath = (
  mesh: TriangleMesh,
  points: readonly TrimBoundaryPoint[],
  drawMode: TrimDrawMode
):
  | { readonly ok: true; readonly path: SurfacePath }
  | { readonly ok: false; readonly code: string; readonly message: string } => {
  const seeds = seedsFromBoundaryPoints(points);
  if (!seeds.ok) {
    return { ok: false, code: 'OFF_SURFACE', message: seeds.message };
  }
  // Already densified SurfacePath samples (post-Close): do not re-run geodesic
  // between every consecutive sample — that is O(n) Dijkstra and can hang Trim.
  const alreadyDense =
    seeds.seeds.length >= 12 &&
    seeds.seeds.every((s) => typeof s.faceId === 'number' && (s.faceId as number) >= 0);
  const reconstruct: SurfacePathReconstructMode = alreadyDense
    ? 'never'
    : reconstructModeForDraw(drawMode);
  const built = createSurfacePath(mesh, seeds.seeds, {
    closed: false,
    reconstruct,
    maxProjectDistanceMm: 12,
    maxJumpMm: 2.5
  });
  if (!built.ok) {
    return {
      ok: false,
      code: built.code,
      message: clinicalSurfacePathMessage(built.code, built.message)
    };
  }
  const simplified = alreadyDense
    ? built.path
    : simplifySurfacePath(mesh, built.path, {
        maxDeviationMm: 0.45,
        maxNormalDotLoss: 0.08
      });
  const closed = closeSurfacePath(mesh, simplified, { maxJumpMm: 2.5, maxProjectDistanceMm: 12 });
  if (!closed.ok) {
    return {
      ok: false,
      code: closed.code,
      message: clinicalSurfacePathMessage(closed.code, closed.message)
    };
  }
  const validated = validateSurfacePath(mesh, closed.path, {
    maxSpacingMm: 40,
    minLengthMm: 0.25
  });
  if (!validated.ok) {
    return {
      ok: false,
      code: validated.code,
      message: clinicalSurfacePathMessage(validated.code, validated.message)
    };
  }
  const quality = measureSurfacePathQuality(closed.path);
  if (quality.enclosedRegionEstimate < 1e-4 && quality.perimeter > 2) {
    return {
      ok: false,
      code: 'NO_REGION',
      message: clinicalSurfacePathMessage('NO_REGION', 'Trim boundary does not enclose removable surface.')
    };
  }
  return { ok: true, path: closed.path };
};

/** Map authoritative SurfacePath samples back into TrimBoundaryPoints (mesh-local authority). */
export const boundaryPointsFromSurfacePath = (
  path: SurfacePath,
  template: readonly TrimBoundaryPoint[]
): TrimBoundaryPoint[] => {
  const first = template[0];
  const objectId = first?.objectId;
  const fingerprint = first?.geometryFingerprint ?? path.meshFingerprint;
  return path.samples.map((s, index) => {
    const screen = template[Math.min(index, template.length - 1)] ?? first;
    const point: TrimBoundaryPoint = {
      x: screen?.x ?? 0,
      y: screen?.y ?? 0,
      localX: s.point[0],
      localY: s.point[1],
      localZ: s.point[2],
      meshX: s.point[0],
      meshY: s.point[1],
      faceId: s.faceId,
      componentId: s.componentId,
      geometryFingerprint: fingerprint,
      ...(screen?.worldX !== undefined ? { worldX: screen.worldX } : {}),
      ...(screen?.worldY !== undefined ? { worldY: screen.worldY } : {}),
      ...(screen?.worldZ !== undefined ? { worldZ: screen.worldZ } : {}),
      ...(s.normal !== undefined
        ? { normalX: s.normal[0], normalY: s.normal[1], normalZ: s.normal[2] }
        : {}),
      ...(objectId !== undefined ? { objectId } : {})
    };
    return Object.freeze(point);
  });
};
