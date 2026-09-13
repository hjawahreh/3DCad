/**
 * ClinicalTrimBoundaryMath — boundary geometry helpers (screen-space + optional surface).
 */

export interface TrimBoundaryPoint {
  readonly x: number;
  readonly y: number;
  /** Mesh-local XY from surface pick (preferred for kernel). */
  readonly meshX?: number;
  readonly meshY?: number;
  readonly worldX?: number;
  readonly worldY?: number;
  readonly worldZ?: number;
  /** Mesh-local 3D from surface pick (preferred for VTK loop3d after orientation). */
  readonly localX?: number;
  readonly localY?: number;
  readonly localZ?: number;
  /** Hit triangle index on WORKING mesh (GEO-001C SurfacePath authority). */
  readonly faceId?: number;
  readonly componentId?: number;
  readonly normalX?: number;
  readonly normalY?: number;
  readonly normalZ?: number;
  readonly geometryFingerprint?: string;
  readonly objectId?: string;
}

export const MIN_BOUNDARY_POINTS = 3;
export const CLOSE_THRESHOLD_PX = 12;
export const FREEHAND_MIN_DISTANCE_PX = 4;

export const clonePoint = (p: TrimBoundaryPoint): TrimBoundaryPoint =>
  Object.freeze({
    x: p.x,
    y: p.y,
    ...(p.meshX !== undefined ? { meshX: p.meshX } : {}),
    ...(p.meshY !== undefined ? { meshY: p.meshY } : {}),
    ...(p.worldX !== undefined ? { worldX: p.worldX } : {}),
    ...(p.worldY !== undefined ? { worldY: p.worldY } : {}),
    ...(p.worldZ !== undefined ? { worldZ: p.worldZ } : {}),
    ...(p.localX !== undefined ? { localX: p.localX } : {}),
    ...(p.localY !== undefined ? { localY: p.localY } : {}),
    ...(p.localZ !== undefined ? { localZ: p.localZ } : {}),
    ...(p.faceId !== undefined ? { faceId: p.faceId } : {}),
    ...(p.componentId !== undefined ? { componentId: p.componentId } : {}),
    ...(p.normalX !== undefined ? { normalX: p.normalX } : {}),
    ...(p.normalY !== undefined ? { normalY: p.normalY } : {}),
    ...(p.normalZ !== undefined ? { normalZ: p.normalZ } : {}),
    ...(p.geometryFingerprint !== undefined ? { geometryFingerprint: p.geometryFingerprint } : {}),
    ...(p.objectId !== undefined ? { objectId: p.objectId } : {})
  });

export const clonePoints = (points: readonly TrimBoundaryPoint[]): TrimBoundaryPoint[] =>
  points.map((p) => clonePoint(p));

export const distance = (a: TrimBoundaryPoint, b: TrimBoundaryPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const isClosedBoundary = (points: readonly TrimBoundaryPoint[]): boolean => {
  if (points.length < MIN_BOUNDARY_POINTS) {
    return false;
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return distance(first, last) <= CLOSE_THRESHOLD_PX;
};

/** Screen-space orientation cross product (signed area * 2). */
const orient = (a: TrimBoundaryPoint, b: TrimBoundaryPoint, c: TrimBoundaryPoint): number =>
  (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

/** Treat near-zero orientations as collinear (projection / float noise). */
const ORIENT_EPS = 1e-8;

const nearZero = (v: number): boolean => Math.abs(v) <= ORIENT_EPS;

const onSegment = (a: TrimBoundaryPoint, b: TrimBoundaryPoint, c: TrimBoundaryPoint): boolean =>
  Math.min(a.x, c.x) - ORIENT_EPS <= b.x &&
  b.x <= Math.max(a.x, c.x) + ORIENT_EPS &&
  Math.min(a.y, c.y) - ORIENT_EPS <= b.y &&
  b.y <= Math.max(a.y, c.y) + ORIENT_EPS;

/**
 * Proper segment intersection: opposite-sign orientations on both segments.
 * Adjacent edges and an edge vs itself are never compared by the caller.
 */
const segmentsIntersect = (
  p1: TrimBoundaryPoint,
  p2: TrimBoundaryPoint,
  p3: TrimBoundaryPoint,
  p4: TrimBoundaryPoint
): boolean => {
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  // Proper crossing: endpoints of each segment lie on opposite sides of the other.
  if (!nearZero(o1) && !nearZero(o2) && !nearZero(o3) && !nearZero(o4)) {
    if (o1 * o2 < 0 && o3 * o4 < 0) {
      return true;
    }
    return false;
  }
  // Collinear / endpoint-on-edge cases (genuine overlaps only).
  if (nearZero(o1) && onSegment(p1, p3, p2)) return true;
  if (nearZero(o2) && onSegment(p1, p4, p2)) return true;
  if (nearZero(o3) && onSegment(p3, p1, p4)) return true;
  if (nearZero(o4) && onSegment(p3, p2, p4)) return true;
  return false;
};

/**
 * True only when non-adjacent edges cross.
 * Skips adjacent pairs and the first/last closing pair of a closed ring.
 */
export const hasSelfIntersection = (points: readonly TrimBoundaryPoint[]): boolean => {
  if (points.length < 4) {
    return false;
  }
  const edgeCount = points.length - 1;
  for (let i = 0; i < edgeCount; i += 1) {
    for (let j = i + 2; j < edgeCount; j += 1) {
      // Closing edge (last) is adjacent to the first edge — skip that pair.
      if (i === 0 && j === edgeCount - 1) {
        continue;
      }
      if (
        segmentsIntersect(points[i]!, points[i + 1]!, points[j]!, points[j + 1]!)
      ) {
        return true;
      }
    }
  }
  return false;
};

export const closeBoundary = (points: readonly TrimBoundaryPoint[]): readonly TrimBoundaryPoint[] => {
  if (points.length === 0) {
    return Object.freeze([]);
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (distance(first, last) <= CLOSE_THRESHOLD_PX) {
    return Object.freeze(clonePoints(points));
  }
  return Object.freeze([...clonePoints(points), clonePoint(first)]);
};

/**
 * Build kernel stroke. Prefer mesh-surface XY (normalized 0..1 via AABB) when available;
 * otherwise pass screen CSS pixels with live viewport projection.
 */
export const boundaryToStroke = (
  points: readonly TrimBoundaryPoint[],
  aabb?: {
    readonly minX: number;
    readonly minY: number;
    readonly spanX: number;
    readonly spanY: number;
  }
): readonly (readonly [number, number])[] => {
  const useSurface =
    aabb !== undefined &&
    points.length > 0 &&
    points.every((p) => p.meshX !== undefined && p.meshY !== undefined);
  if (useSurface && aabb !== undefined) {
    return Object.freeze(
      points.map((p) =>
        Object.freeze([
          (p.meshX! - aabb.minX) / aabb.spanX,
          (p.meshY! - aabb.minY) / aabb.spanY
        ] as const)
      )
    );
  }
  return Object.freeze(points.map((p) => Object.freeze([p.x, p.y] as const)));
};

export const shouldAddFreehandPoint = (
  points: readonly TrimBoundaryPoint[],
  next: TrimBoundaryPoint
): boolean => {
  if (points.length === 0) {
    return true;
  }
  return distance(points[points.length - 1]!, next) >= FREEHAND_MIN_DISTANCE_PX;
};
