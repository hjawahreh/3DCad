/**
 * CLN-001A — pure surface-distance helpers (no clinical claims).
 */

export type Vec3 = readonly [number, number, number];

const dist = (a: Vec3, b: Vec3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Nearest-neighbor directed mean / p95 / max from A→B sample clouds. */
export const directedSurfaceDistanceStats = (
  from: readonly Vec3[],
  to: readonly Vec3[]
): {
  readonly mean: number;
  readonly p95: number;
  readonly max: number;
  readonly count: number;
} => {
  if (from.length === 0 || to.length === 0) {
    return Object.freeze({ mean: Number.NaN, p95: Number.NaN, max: Number.NaN, count: 0 });
  }
  const distances: number[] = [];
  for (const p of from) {
    let best = Number.POSITIVE_INFINITY;
    for (const q of to) {
      const d = dist(p, q);
      if (d < best) best = d;
    }
    distances.push(best);
  }
  distances.sort((a, b) => a - b);
  const mean = distances.reduce((s, d) => s + d, 0) / distances.length;
  const p95 = distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.95))]!;
  const max = distances[distances.length - 1]!;
  return Object.freeze({ mean, p95, max, count: distances.length });
};

/** Symmetric Hausdorff ≈ max(directed max A→B, directed max B→A). */
export const hausdorffDistance = (a: readonly Vec3[], b: readonly Vec3[]): number => {
  const ab = directedSurfaceDistanceStats(a, b);
  const ba = directedSurfaceDistanceStats(b, a);
  if (!Number.isFinite(ab.max) || !Number.isFinite(ba.max)) return Number.NaN;
  return Math.max(ab.max, ba.max);
};

export const meanSymmetricSurfaceDistance = (
  a: readonly Vec3[],
  b: readonly Vec3[]
): number => {
  const ab = directedSurfaceDistanceStats(a, b);
  const ba = directedSurfaceDistanceStats(b, a);
  if (!Number.isFinite(ab.mean) || !Number.isFinite(ba.mean)) return Number.NaN;
  return (ab.mean + ba.mean) * 0.5;
};
