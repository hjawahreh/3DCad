/**
 * CLN-001A — 3DTeethSeg22-compatible metric definitions (faithful formulas).
 *
 * TLA = mean normalized centroid localization error over matched teeth
 * TIR = fraction of reference teeth with correct localization AND correct FDI label
 * TSA = mean per-tooth instance F1 (surface / face-set agreement)
 *
 * Does not claim challenge leaderboard numbers without licensed data.
 */

import { binaryOverlapFromSets } from './RegionOverlapMetrics.js';

export type FdiLabel = number;

export interface TeethSegToothInstance {
  readonly fdi: FdiLabel;
  /** Centroid in model space (mm). */
  readonly centroid: readonly [number, number, number];
  /** Face indices belonging to the tooth instance (mesh face ids). */
  readonly faceIndices: ReadonlySet<number>;
}

export interface PerToothSegResult {
  readonly fdi: FdiLabel;
  readonly matched: boolean;
  readonly labelCorrect: boolean;
  readonly centroidErrorMm: number | null;
  readonly normalizedCentroidError: number | null;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  readonly status: 'matched' | 'missing' | 'false-positive';
}

export interface TeethSeg22MetricsResult {
  readonly tla: number | null;
  readonly tir: number | null;
  readonly tsa: number | null;
  readonly macroF1: number | null;
  readonly microF1: number | null;
  readonly gingivaF1: number | null;
  readonly instanceCountPredicted: number;
  readonly instanceCountReference: number;
  readonly missingToothCount: number;
  readonly falseToothCount: number;
  readonly perTooth: readonly PerToothSegResult[];
}

const dist = (
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * @param localizationRadiusMm — localization radius used to normalize TLA and decide TIR localization
 * @param gingivaPredicted / gingivaReference — optional gingiva face sets
 */
export const computeTeethSeg22Metrics = (input: {
  readonly predicted: readonly TeethSegToothInstance[];
  readonly reference: readonly TeethSegToothInstance[];
  readonly localizationRadiusMm: number;
  readonly gingivaPredicted?: ReadonlySet<number>;
  readonly gingivaReference?: ReadonlySet<number>;
}): TeethSeg22MetricsResult => {
  const radius = Math.max(1e-6, input.localizationRadiusMm);
  const refByFdi = new Map(input.reference.map((t) => [t.fdi, t] as const));
  const predByFdi = new Map(input.predicted.map((t) => [t.fdi, t] as const));
  const allFdi = new Set<number>([...refByFdi.keys(), ...predByFdi.keys()]);

  const perTooth: PerToothSegResult[] = [];
  const tlaSamples: number[] = [];
  let tirHits = 0;
  let tirDenom = 0;
  const f1Samples: number[] = [];
  let microTp = 0;
  let microFp = 0;
  let microFn = 0;
  let missing = 0;
  let falsePos = 0;

  for (const fdi of [...allFdi].sort((a, b) => a - b)) {
    const ref = refByFdi.get(fdi);
    const pred = predByFdi.get(fdi);
    if (ref !== undefined && pred === undefined) {
      missing += 1;
      tirDenom += 1;
      perTooth.push(
        Object.freeze({
          fdi,
          matched: false,
          labelCorrect: false,
          centroidErrorMm: null,
          normalizedCentroidError: null,
          precision: null,
          recall: null,
          f1: null,
          status: 'missing'
        })
      );
      continue;
    }
    if (ref === undefined && pred !== undefined) {
      falsePos += 1;
      perTooth.push(
        Object.freeze({
          fdi,
          matched: false,
          labelCorrect: false,
          centroidErrorMm: null,
          normalizedCentroidError: null,
          precision: null,
          recall: null,
          f1: null,
          status: 'false-positive'
        })
      );
      continue;
    }
    if (ref === undefined || pred === undefined) continue;

    tirDenom += 1;
    const centroidErrorMm = dist(pred.centroid, ref.centroid);
    const normalized = centroidErrorMm / radius;
    tlaSamples.push(normalized);
    const localized = centroidErrorMm <= radius;
    const labelCorrect = pred.fdi === ref.fdi;
    if (localized && labelCorrect) tirHits += 1;

    const overlap = binaryOverlapFromSets(pred.faceIndices, ref.faceIndices);
    f1Samples.push(overlap.f1);
    microTp += overlap.truePositive;
    microFp += overlap.falsePositive;
    microFn += overlap.falseNegative;

    perTooth.push(
      Object.freeze({
        fdi,
        matched: true,
        labelCorrect,
        centroidErrorMm,
        normalizedCentroidError: normalized,
        precision: overlap.precision,
        recall: overlap.recall,
        f1: overlap.f1,
        status: 'matched'
      })
    );
  }

  const tla =
    tlaSamples.length === 0
      ? null
      : tlaSamples.reduce((s, x) => s + x, 0) / tlaSamples.length;
  const tir = tirDenom === 0 ? null : tirHits / tirDenom;
  const tsa =
    f1Samples.length === 0 ? null : f1Samples.reduce((s, x) => s + x, 0) / f1Samples.length;
  const macroF1 = tsa;
  const microPrecision = microTp + microFp === 0 ? 0 : microTp / (microTp + microFp);
  const microRecall = microTp + microFn === 0 ? 0 : microTp / (microTp + microFn);
  const microF1 =
    microPrecision + microRecall === 0
      ? null
      : (2 * microPrecision * microRecall) / (microPrecision + microRecall);

  let gingivaF1: number | null = null;
  if (input.gingivaPredicted !== undefined && input.gingivaReference !== undefined) {
    gingivaF1 = binaryOverlapFromSets(input.gingivaPredicted, input.gingivaReference).f1;
  }

  return Object.freeze({
    tla,
    tir,
    tsa,
    macroF1,
    microF1,
    gingivaF1,
    instanceCountPredicted: input.predicted.length,
    instanceCountReference: input.reference.length,
    missingToothCount: missing,
    falseToothCount: falsePos,
    perTooth: Object.freeze(perTooth)
  });
};
