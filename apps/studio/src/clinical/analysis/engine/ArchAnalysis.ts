/**
 * Arch analysis foundation — deterministic quadratic fit through tooth centroids.
 * Mathematical fit only — not a clinically validated arch form.
 */

import type { ToothInstancePrediction } from '../../segmentation/prediction/types.js';
import {
  ANALYSIS_ALGORITHM_VERSIONS,
  createAnalysisId,
  createMeasurementId,
  type AnalysisVec3,
  type ClinicalAnalysisResult
} from '../types.js';
import {
  CANONICAL_LENGTH_UNIT,
  clampDisplay,
  formatLengthMm
} from '../units.js';
import { fromTuple, vDistance } from './VecMath.js';

export interface ArchCurveFit {
  readonly method: 'quadratic-xy';
  readonly version: string;
  readonly coefficients: readonly [number, number, number]; // y = a + b x + c x^2
  readonly samples: readonly AnalysisVec3[];
  readonly sourceTeeth: readonly string[];
  readonly fitRmse: number;
  readonly archWidthMm: number | undefined;
  readonly archDepthMm: number | undefined;
}

const identifiedTeeth = (
  instances: readonly ToothInstancePrediction[]
): ToothInstancePrediction[] =>
  instances.filter(
    (t) =>
      t.presence === 'PRESENT' &&
      t.identification.status === 'IDENTIFIED' &&
      t.identification.fdi !== undefined
  );

export const fitArchCurve = (
  instances: readonly ToothInstancePrediction[],
  now: number,
  sourceRevision: number,
  segmentationRevision: number | undefined,
  fingerprint: string | undefined,
  sourceObjectId: string
): ClinicalAnalysisResult => {
  const teeth = identifiedTeeth(instances);
  if (teeth.length < 3) {
    return Object.freeze({
      analysisId: createAnalysisId('arch', now),
      analysisType: 'arch',
      sourceRevision,
      segmentationRevision,
      geometryFingerprint: fingerprint,
      algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.arch,
      validity: 'INCOMPLETE',
      warnings: Object.freeze([
        'Cannot fit arch curve — need at least 3 identified present teeth.'
      ]),
      measurements: Object.freeze([]),
      payload: Object.freeze({ toothCount: teeth.length }),
      timestamp: now,
      decisionSupportOnly: true
    });
  }

  const points = teeth
    .map((t) => ({ id: t.instanceId, p: fromTuple(t.centroid) }))
    .sort((a, b) => a.p.x - b.p.x);

  // Least squares for y = a + b x + c x^2
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let t0 = 0;
  let t1 = 0;
  let t2 = 0;
  for (const { p } of points) {
    const x = p.x;
    const y = p.y;
    const x2 = x * x;
    s0 += 1;
    s1 += x;
    s2 += x2;
    s3 += x2 * x;
    s4 += x2 * x2;
    t0 += y;
    t1 += x * y;
    t2 += x2 * y;
  }

  // Solve 3x3 via Cramer's rule
  const det =
    s0 * (s2 * s4 - s3 * s3) -
    s1 * (s1 * s4 - s3 * s2) +
    s2 * (s1 * s3 - s2 * s2);
  let a = 0;
  let b = 0;
  let c = 0;
  if (Math.abs(det) > 1e-12) {
    a =
      (t0 * (s2 * s4 - s3 * s3) -
        s1 * (t1 * s4 - s3 * t2) +
        s2 * (t1 * s3 - s2 * t2)) /
      det;
    b =
      (s0 * (t1 * s4 - s3 * t2) -
        t0 * (s1 * s4 - s3 * s2) +
        s2 * (s1 * t2 - t1 * s2)) /
      det;
    c =
      (s0 * (s2 * t2 - t1 * s3) -
        s1 * (s1 * t2 - t0 * s3) +
        t0 * (s1 * s2 - s2 * s2)) /
      det;
  }

  let sse = 0;
  const samples: AnalysisVec3[] = [];
  for (const { p } of points) {
    const yHat = a + b * p.x + c * p.x * p.x;
    sse += (p.y - yHat) ** 2;
    samples.push(Object.freeze({ x: p.x, y: yHat, z: p.z }));
  }
  const rmse = Math.sqrt(sse / points.length);

  const left = points[0]!.p;
  const right = points[points.length - 1]!.p;
  const archWidthMm = vDistance(
    Object.freeze({ x: left.x, y: left.y, z: 0 }),
    Object.freeze({ x: right.x, y: right.y, z: 0 })
  );
  const midX = (left.x + right.x) * 0.5;
  const midY = a + b * midX + c * midX * midX;
  const anterior = points.reduce((best, cur) =>
    Math.abs(cur.p.y - midY) > Math.abs(best.p.y - midY) ? cur : best
  );
  const archDepthMm = Math.abs(anterior.p.y - midY);

  const fit: ArchCurveFit = Object.freeze({
    method: 'quadratic-xy',
    version: ANALYSIS_ALGORITHM_VERSIONS.arch,
    coefficients: Object.freeze([a, b, c] as const),
    samples: Object.freeze(samples),
    sourceTeeth: Object.freeze(points.map((p) => p.id)),
    fitRmse: rmse,
    archWidthMm,
    archDepthMm
  });

  const warnings = Object.freeze([
    'Arch curve is a mathematical quadratic fit — not a clinically validated arch form.'
  ]);

  return Object.freeze({
    analysisId: createAnalysisId('arch', now),
    analysisType: 'arch',
    sourceRevision,
    segmentationRevision,
    geometryFingerprint: fingerprint,
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.arch,
    validity: rmse > 5 ? 'WARNING' : 'VALID',
    warnings,
    measurements: Object.freeze([
      Object.freeze({
        measurementId: createMeasurementId('arch-width', now),
        measurementType: 'arch-width' as const,
        sourceRevision,
        sourceObjectIds: Object.freeze([sourceObjectId]),
        geometricReferences: fit.sourceTeeth,
        value: Object.freeze({
          value: clampDisplay(archWidthMm, 2),
          unit: CANONICAL_LENGTH_UNIT,
          display: formatLengthMm(clampDisplay(archWidthMm, 2))
        }),
        validity: 'VALID' as const,
        warnings: Object.freeze([
          'Arch width uses outermost identified tooth centroids in XY.'
        ]),
        computationVersion: ANALYSIS_ALGORITHM_VERSIONS.archWidth,
        timestamp: now,
        metadata: Object.freeze({ definition: 'outermost-centroid-xy' })
      }),
      Object.freeze({
        measurementId: createMeasurementId('arch-depth', now),
        measurementType: 'arch' as const,
        sourceRevision,
        sourceObjectIds: Object.freeze([sourceObjectId]),
        geometricReferences: fit.sourceTeeth,
        value: Object.freeze({
          value: clampDisplay(archDepthMm, 2),
          unit: CANONICAL_LENGTH_UNIT,
          display: formatLengthMm(clampDisplay(archDepthMm, 2))
        }),
        validity: 'VALID' as const,
        warnings: Object.freeze([]),
        computationVersion: ANALYSIS_ALGORITHM_VERSIONS.arch,
        timestamp: now,
        metadata: Object.freeze({ definition: 'anterior-offset-from-chord' })
      })
    ]),
    payload: Object.freeze({ fit }),
    timestamp: now,
    decisionSupportOnly: true
  });
};
