/**
 * Bolton-style analysis provider foundation — incomplete when teeth missing.
 */

import type { ToothInstancePrediction } from '../../segmentation/prediction/types.js';
import type { FdiNumber } from '../../segmentation/fdi/FdiNumbering.js';
import {
  ANALYSIS_ALGORITHM_VERSIONS,
  createAnalysisId,
  type ClinicalAnalysisResult
} from '../types.js';
import { fromTuple } from './VecMath.js';

const ANTERIOR: readonly FdiNumber[] = Object.freeze([
  12, 11, 21, 22, 32, 31, 41, 42
] as FdiNumber[]);

export const analyzeBolton = (
  instances: readonly ToothInstancePrediction[],
  now: number,
  sourceRevision: number,
  segmentationRevision: number | undefined,
  fingerprint: string | undefined
): ClinicalAnalysisResult => {
  const present = new Map<FdiNumber, number>();
  for (const inst of instances) {
    const fdi = inst.identification.fdi;
    if (
      fdi === undefined ||
      inst.identification.status !== 'IDENTIFIED' ||
      inst.presence !== 'PRESENT'
    ) {
      continue;
    }
    const min = fromTuple(inst.bounds.min);
    const max = fromTuple(inst.bounds.max);
    present.set(fdi, Math.abs(max.x - min.x));
  }

  const missing = ANTERIOR.filter((f) => !present.has(f));
  if (missing.length > 0) {
    return Object.freeze({
      analysisId: createAnalysisId('bolton', now),
      analysisType: 'bolton',
      sourceRevision,
      segmentationRevision,
      geometryFingerprint: fingerprint,
      algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.bolton,
      validity: 'INCOMPLETE',
      warnings: Object.freeze([
        `Bolton-style analysis incomplete — missing teeth: ${missing.join(', ')}`
      ]),
      measurements: Object.freeze([]),
      payload: Object.freeze({
        toothSet: 'anterior',
        missing,
        excluded: [],
        method: 'aabb-md-sum-ratio'
      }),
      timestamp: now,
      decisionSupportOnly: true
    });
  }

  let upper = 0;
  let lower = 0;
  for (const f of ANTERIOR) {
    const w = present.get(f)!;
    if (f < 30) upper += w;
    else lower += w;
  }
  const ratio = upper > 0 ? lower / upper : Number.NaN;

  return Object.freeze({
    analysisId: createAnalysisId('bolton', now),
    analysisType: 'bolton',
    sourceRevision,
    segmentationRevision,
    geometryFingerprint: fingerprint,
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.bolton,
    validity: 'WARNING',
    warnings: Object.freeze([
      'Bolton-style ratio uses geometric AABB widths — not calibrated clinical Bolton analysis.'
    ]),
    measurements: Object.freeze([]),
    payload: Object.freeze({
      toothSet: 'anterior',
      missing: [],
      upperSumMm: upper,
      lowerSumMm: lower,
      ratio,
      method: 'aabb-md-sum-ratio'
    }),
    timestamp: now,
    decisionSupportOnly: true
  });
};
