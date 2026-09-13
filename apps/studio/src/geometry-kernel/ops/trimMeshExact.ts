/**
 * Exact triangle/edge trim against a 2D boundary polygon (mesh XY).
 *
 * Strategy:
 * - Fully exterior / interior triangles classified by centroid (no boundary hit).
 * - Straddling triangles recursively split at exact segment∩segment crossings
 *   until no edge intersects the boundary, then classify.
 * - Z is preserved via linear interpolation along split edges.
 *
 * Prefer this over centroid-only classification for production Trim.
 */

export interface TrimPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface ExactTrimVertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ExactTrimTriangle {
  readonly a: ExactTrimVertex;
  readonly b: ExactTrimVertex;
  readonly c: ExactTrimVertex;
}

const EPS = 1e-9;
const MAX_SPLIT_DEPTH = 48;

const pointInPolygon = (x: number, y: number, poly: readonly TrimPoint2D[]): boolean => {
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

const nearlyEqual = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;

const lerp = (a: ExactTrimVertex, b: ExactTrimVertex, t: number): ExactTrimVertex => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t
});

const segmentIntersection = (
  a: ExactTrimVertex,
  b: ExactTrimVertex,
  c: TrimPoint2D,
  d: TrimPoint2D
): number | undefined => {
  const rX = b.x - a.x;
  const rY = b.y - a.y;
  const sX = d.x - c.x;
  const sY = d.y - c.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) <= EPS) {
    return undefined;
  }
  const qpx = c.x - a.x;
  const qpy = c.y - a.y;
  const t = (qpx * sY - qpy * sX) / denom;
  const u = (qpx * rY - qpy * rX) / denom;
  if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) {
    return undefined;
  }
  return t;
};

const findEdgeSplit = (
  a: ExactTrimVertex,
  b: ExactTrimVertex,
  poly: readonly TrimPoint2D[]
): number | undefined => {
  let best: number | undefined;
  for (let i = 0; i < poly.length; i += 1) {
    const c = poly[i]!;
    const d = poly[(i + 1) % poly.length]!;
    const t = segmentIntersection(a, b, c, d);
    if (t === undefined) {
      continue;
    }
    if (best === undefined || Math.abs(t - 0.5) < Math.abs(best - 0.5)) {
      best = t;
    }
  }
  return best;
};

const triangleCentroid = (tri: ExactTrimTriangle): TrimPoint2D => ({
  x: (tri.a.x + tri.b.x + tri.c.x) / 3,
  y: (tri.a.y + tri.b.y + tri.c.y) / 3
});

const hasBoundaryHit = (tri: ExactTrimTriangle, poly: readonly TrimPoint2D[]): boolean => {
  const edges: Array<readonly [ExactTrimVertex, ExactTrimVertex]> = [
    [tri.a, tri.b],
    [tri.b, tri.c],
    [tri.c, tri.a]
  ];
  for (const [p, q] of edges) {
    if (findEdgeSplit(p, q, poly) !== undefined) {
      return true;
    }
  }
  return false;
};

/**
 * Recursively split straddling triangles at exact boundary crossings.
 * Emits exterior fragments only (interior of poly removed).
 */
export const clipTriangleExteriorExact = (
  tri: ExactTrimTriangle,
  poly: readonly TrimPoint2D[],
  depth = 0,
  out: ExactTrimTriangle[] = []
): ExactTrimTriangle[] => {
  if (poly.length < 3) {
    out.push(tri);
    return out;
  }

  const hit = hasBoundaryHit(tri, poly);
  if (!hit || depth >= MAX_SPLIT_DEPTH) {
    const c = triangleCentroid(tri);
    if (!pointInPolygon(c.x, c.y, poly)) {
      out.push(tri);
    }
    return out;
  }

  const edges: Array<{
    readonly a: ExactTrimVertex;
    readonly b: ExactTrimVertex;
    readonly opposite: ExactTrimVertex;
  }> = [
    { a: tri.a, b: tri.b, opposite: tri.c },
    { a: tri.b, b: tri.c, opposite: tri.a },
    { a: tri.c, b: tri.a, opposite: tri.b }
  ];

  for (const edge of edges) {
    const t = findEdgeSplit(edge.a, edge.b, poly);
    if (t === undefined) {
      continue;
    }
    const p = lerp(edge.a, edge.b, t);
    // Degenerate guard — skip near-zero splits.
    if (
      (nearlyEqual(p.x, edge.a.x) && nearlyEqual(p.y, edge.a.y)) ||
      (nearlyEqual(p.x, edge.b.x) && nearlyEqual(p.y, edge.b.y))
    ) {
      continue;
    }
    clipTriangleExteriorExact(
      { a: edge.a, b: p, c: edge.opposite },
      poly,
      depth + 1,
      out
    );
    clipTriangleExteriorExact(
      { a: p, b: edge.b, c: edge.opposite },
      poly,
      depth + 1,
      out
    );
    return out;
  }

  const c = triangleCentroid(tri);
  if (!pointInPolygon(c.x, c.y, poly)) {
    out.push(tri);
  }
  return out;
};

/** Signed area of a closed 2D polygon (mesh units²). */
export const polygonSignedArea = (poly: readonly TrimPoint2D[]): number => {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j]!.x + poly[i]!.x) * (poly[j]!.y - poly[i]!.y);
  }
  return area * 0.5;
};

export const polygonAbsoluteArea = (poly: readonly TrimPoint2D[]): number =>
  Math.abs(polygonSignedArea(poly));
