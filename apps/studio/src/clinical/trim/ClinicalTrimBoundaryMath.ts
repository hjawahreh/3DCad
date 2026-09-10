/**
 * ClinicalTrimBoundaryMath — boundary geometry helpers (screen-space, no kernel).
 */

export interface TrimBoundaryPoint {
  readonly x: number;
  readonly y: number;
}

export const MIN_BOUNDARY_POINTS = 3;
export const CLOSE_THRESHOLD_PX = 12;
export const FREEHAND_MIN_DISTANCE_PX = 4;

export const clonePoints = (points: readonly TrimBoundaryPoint[]): TrimBoundaryPoint[] =>
  points.map((p) => Object.freeze({ x: p.x, y: p.y }));

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

const orient = (a: TrimBoundaryPoint, b: TrimBoundaryPoint, c: TrimBoundaryPoint): number =>
  (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

const onSegment = (a: TrimBoundaryPoint, b: TrimBoundaryPoint, c: TrimBoundaryPoint): boolean =>
  Math.min(a.x, c.x) <= b.x &&
  b.x <= Math.max(a.x, c.x) &&
  Math.min(a.y, c.y) <= b.y &&
  b.y <= Math.max(a.y, c.y);

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
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
};

export const hasSelfIntersection = (points: readonly TrimBoundaryPoint[]): boolean => {
  if (points.length < 4) {
    return false;
  }
  const n = points.length;
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 2; j < n - 1; j += 1) {
      if (i === 0 && j === n - 2) {
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
  return Object.freeze([...clonePoints(points), Object.freeze({ x: first.x, y: first.y })]);
};

export const boundaryToStroke = (
  points: readonly TrimBoundaryPoint[]
): readonly (readonly [number, number])[] =>
  Object.freeze(points.map((p) => Object.freeze([p.x, p.y] as const)));

export const shouldAddFreehandPoint = (
  points: readonly TrimBoundaryPoint[],
  next: TrimBoundaryPoint
): boolean => {
  if (points.length === 0) {
    return true;
  }
  return distance(points[points.length - 1]!, next) >= FREEHAND_MIN_DISTANCE_PX;
};
