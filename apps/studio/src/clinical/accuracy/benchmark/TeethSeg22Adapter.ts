/**
 * CLN-001A — isolated 3DTeethSeg22-style benchmark adapter.
 *
 * Maps point labels + tooth instances + FDI + gingiva into internal
 * TeethSegToothInstance form without coupling ClinicalDocument to benchmark files.
 *
 * Does not load proprietary challenge archives. Callers supply already-decoded
 * arrays when legally cleared.
 */

import type { TeethSegToothInstance } from '../metrics/TeethSeg22Metrics.js';
import { computeTeethSeg22Metrics, type TeethSeg22MetricsResult } from '../metrics/TeethSeg22Metrics.js';

/** Gingiva semantic id commonly used in 3DTeethSeg-style labels. */
export const TEETH_SEG22_GINGIVA_LABEL = 0;

export interface TeethSeg22PointCloudLabeling {
  /** Nx3 point positions (mm). */
  readonly points: ReadonlyArray<readonly [number, number, number]>;
  /** Per-point semantic/instance label (0 = gingiva when using FDI scheme). */
  readonly labels: ReadonlyArray<number>;
  /**
   * Optional per-point FDI (when labels are instance ids rather than FDI).
   * When omitted, `labels` are treated as FDI for non-gingiva points.
   */
  readonly fdiByPoint?: ReadonlyArray<number>;
}

export interface TeethSeg22AdaptedInstances {
  readonly teeth: readonly TeethSegToothInstance[];
  readonly gingivaPointIndices: ReadonlySet<number>;
}

const centroidOf = (
  points: ReadonlyArray<readonly [number, number, number]>,
  indices: readonly number[]
): readonly [number, number, number] => {
  if (indices.length === 0) return Object.freeze([0, 0, 0] as const);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of indices) {
    const p = points[i]!;
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = indices.length;
  return Object.freeze([x / n, y / n, z / n] as const);
};

/**
 * Adapt benchmark point labeling into internal tooth instances.
 * Face indices are approximated as point indices for set-overlap metrics when
 * only point clouds are available (documented limitation).
 */
export const adaptTeethSeg22PointLabels = (
  input: TeethSeg22PointCloudLabeling
): TeethSeg22AdaptedInstances => {
  const gingiva = new Set<number>();
  const byFdi = new Map<number, number[]>();

  for (let i = 0; i < input.labels.length; i += 1) {
    const raw = input.labels[i]!;
    const fdi = input.fdiByPoint?.[i] ?? raw;
    if (raw === TEETH_SEG22_GINGIVA_LABEL || fdi === TEETH_SEG22_GINGIVA_LABEL) {
      gingiva.add(i);
      continue;
    }
    const bucket = byFdi.get(fdi);
    if (bucket !== undefined) bucket.push(i);
    else byFdi.set(fdi, [i]);
  }

  const teeth: TeethSegToothInstance[] = [];
  for (const fdi of [...byFdi.keys()].sort((a, b) => a - b)) {
    const indices = byFdi.get(fdi)!;
    teeth.push(
      Object.freeze({
        fdi,
        centroid: centroidOf(input.points, indices),
        faceIndices: Object.freeze(new Set(indices))
      })
    );
  }

  return Object.freeze({
    teeth: Object.freeze(teeth),
    gingivaPointIndices: Object.freeze(gingiva)
  });
};

export const evaluateTeethSeg22Benchmark = (input: {
  readonly predicted: TeethSeg22PointCloudLabeling;
  readonly reference: TeethSeg22PointCloudLabeling;
  readonly localizationRadiusMm?: number;
}): TeethSeg22MetricsResult => {
  const pred = adaptTeethSeg22PointLabels(input.predicted);
  const ref = adaptTeethSeg22PointLabels(input.reference);
  return computeTeethSeg22Metrics({
    predicted: pred.teeth,
    reference: ref.teeth,
    localizationRadiusMm: input.localizationRadiusMm ?? 5,
    gingivaPredicted: pred.gingivaPointIndices,
    gingivaReference: ref.gingivaPointIndices
  });
};
