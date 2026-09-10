/**
 * Spacing analysis — gaps between adjacent identified teeth (centroid XY).
 */

import type { ToothInstancePrediction } from '../../segmentation/prediction/types.js';
import type { FdiNumber } from '../../segmentation/fdi/FdiNumbering.js';
import {
  ANALYSIS_ALGORITHM_VERSIONS,
  createAnalysisId,
  createMeasurementId,
  type ClinicalAnalysisResult
} from '../types.js';
import {
  CANONICAL_LENGTH_UNIT,
  clampDisplay,
  formatLengthMm
} from '../units.js';
import { fromTuple, vDistance } from './VecMath.js';

export interface SpacingPair {
  readonly aFdi: FdiNumber;
  readonly bFdi: FdiNumber;
  readonly aId: string;
  readonly bId: string;
  readonly distanceMm: number;
  readonly status: 'measured' | 'uncertain' | 'unavailable';
}

const adjacentFdiPairs = (fdis: readonly FdiNumber[]): readonly [FdiNumber, FdiNumber][] => {
  const sorted = [...fdis].sort((a, b) => a - b);
  const pairs: [FdiNumber, FdiNumber][] = [];
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    // Same quadrant consecutive numbers
    if (Math.floor(a / 10) === Math.floor(b / 10) && b - a === 1) {
      pairs.push([a, b]);
    }
  }
  return Object.freeze(pairs);
};

export const analyzeSpacing = (
  instances: readonly ToothInstancePrediction[],
  now: number,
  sourceRevision: number,
  segmentationRevision: number | undefined,
  fingerprint: string | undefined,
  sourceObjectId: string
): ClinicalAnalysisResult => {
  const byFdi = new Map<FdiNumber, ToothInstancePrediction>();
  const warnings: string[] = [];
  for (const inst of instances) {
    if (inst.identification.status === 'UNCERTAIN') {
      warnings.push(`Uncertain identification for ${inst.instanceId}`);
      continue;
    }
    if (
      inst.identification.status !== 'IDENTIFIED' ||
      inst.identification.fdi === undefined ||
      inst.presence !== 'PRESENT'
    ) {
      continue;
    }
    byFdi.set(inst.identification.fdi, inst);
  }

  if (byFdi.size < 2) {
    return Object.freeze({
      analysisId: createAnalysisId('spacing', now),
      analysisType: 'spacing',
      sourceRevision,
      segmentationRevision,
      geometryFingerprint: fingerprint,
      algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.spacing,
      validity: 'INCOMPLETE',
      warnings: Object.freeze([
        'Cannot calculate spacing — fewer than two identified present teeth.'
      ]),
      measurements: Object.freeze([]),
      payload: Object.freeze({ pairs: [] }),
      timestamp: now,
      decisionSupportOnly: true
    });
  }

  const pairs = adjacentFdiPairs([...byFdi.keys()]);
  const results: SpacingPair[] = [];
  for (const [aFdi, bFdi] of pairs) {
    const a = byFdi.get(aFdi)!;
    const b = byFdi.get(bFdi)!;
    const dist = vDistance(fromTuple(a.centroid), fromTuple(b.centroid));
    results.push(
      Object.freeze({
        aFdi,
        bFdi,
        aId: a.instanceId,
        bId: b.instanceId,
        distanceMm: dist,
        status: 'measured' as const
      })
    );
  }

  const validity = warnings.length > 0 ? 'WARNING' : results.length > 0 ? 'VALID' : 'INCOMPLETE';
  if (results.length === 0) {
    warnings.push('No adjacent FDI pairs available for spacing.');
  }

  return Object.freeze({
    analysisId: createAnalysisId('spacing', now),
    analysisType: 'spacing',
    sourceRevision,
    segmentationRevision,
    geometryFingerprint: fingerprint,
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.spacing,
    validity,
    warnings: Object.freeze(warnings),
    measurements: Object.freeze(
      results.map((p) =>
        Object.freeze({
          measurementId: createMeasurementId(`space-${String(p.aFdi)}-${String(p.bFdi)}`, now),
          measurementType: 'spacing' as const,
          sourceRevision,
          sourceObjectIds: Object.freeze([sourceObjectId]),
          geometricReferences: Object.freeze([p.aId, p.bId]),
          value: Object.freeze({
            value: clampDisplay(p.distanceMm, 2),
            unit: CANONICAL_LENGTH_UNIT,
            display: formatLengthMm(clampDisplay(p.distanceMm, 2))
          }),
          validity: 'VALID' as const,
          warnings: Object.freeze(['Centroid-to-centroid spacing — not contact point spacing.']),
          computationVersion: ANALYSIS_ALGORITHM_VERSIONS.spacing,
          timestamp: now,
          metadata: Object.freeze({ aFdi: p.aFdi, bFdi: p.bFdi })
        })
      )
    ),
    payload: Object.freeze({ pairs: results }),
    timestamp: now,
    decisionSupportOnly: true
  });
};
