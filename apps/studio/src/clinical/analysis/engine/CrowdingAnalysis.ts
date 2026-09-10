/**
 * Crowding foundation — estimated arch discrepancy from tooth extents vs arch length.
 * Decision-support only; not a clinical diagnosis.
 */

import type { ToothInstancePrediction } from '../../segmentation/prediction/types.js';
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

export const analyzeCrowding = (
  instances: readonly ToothInstancePrediction[],
  now: number,
  sourceRevision: number,
  segmentationRevision: number | undefined,
  fingerprint: string | undefined,
  sourceObjectId: string
): ClinicalAnalysisResult => {
  const teeth = instances.filter(
    (t) =>
      t.presence === 'PRESENT' &&
      t.identification.status === 'IDENTIFIED' &&
      t.identification.fdi !== undefined
  );

  if (teeth.length < 4) {
    return Object.freeze({
      analysisId: createAnalysisId('crowding', now),
      analysisType: 'crowding',
      sourceRevision,
      segmentationRevision,
      geometryFingerprint: fingerprint,
      algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.crowding,
      validity: 'INCOMPLETE',
      warnings: Object.freeze([
        'Cannot calculate arch discrepancy because required teeth are missing or unidentified.'
      ]),
      measurements: Object.freeze([]),
      payload: Object.freeze({ toothCount: teeth.length }),
      timestamp: now,
      decisionSupportOnly: true
    });
  }

  const sorted = [...teeth].sort(
    (a, b) => (a.identification.fdi ?? 0) - (b.identification.fdi ?? 0)
  );

  let required = 0;
  for (const t of sorted) {
    const min = fromTuple(t.bounds.min);
    const max = fromTuple(t.bounds.max);
    required += Math.abs(max.x - min.x);
  }

  let available = 0;
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    available += vDistance(fromTuple(sorted[i]!.centroid), fromTuple(sorted[i + 1]!.centroid));
  }

  const discrepancy = required - available;
  const warnings = Object.freeze([
    'Crowding estimate uses AABB mesiodistal extents vs centroid polyline — not a clinical diagnosis.',
    'Decision support only.'
  ]);

  return Object.freeze({
    analysisId: createAnalysisId('crowding', now),
    analysisType: 'crowding',
    sourceRevision,
    segmentationRevision,
    geometryFingerprint: fingerprint,
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.crowding,
    validity: 'WARNING',
    confidence: 0.5,
    warnings,
    measurements: Object.freeze([
      Object.freeze({
        measurementId: createMeasurementId('crowding', now),
        measurementType: 'crowding' as const,
        sourceRevision,
        sourceObjectIds: Object.freeze([sourceObjectId]),
        geometricReferences: Object.freeze(sorted.map((t) => t.instanceId)),
        value: Object.freeze({
          value: clampDisplay(discrepancy, 2),
          unit: CANONICAL_LENGTH_UNIT,
          display: formatLengthMm(clampDisplay(discrepancy, 2))
        }),
        validity: 'WARNING' as const,
        warnings,
        computationVersion: ANALYSIS_ALGORITHM_VERSIONS.crowding,
        timestamp: now,
        metadata: Object.freeze({
          requiredMm: required,
          availableMm: available,
          method: 'aabb-md-vs-centroid-polyline'
        })
      })
    ]),
    payload: Object.freeze({
      requiredMm: required,
      availableMm: available,
      discrepancyMm: discrepancy,
      contributingTeeth: sorted.map((t) => t.identification.fdi)
    }),
    timestamp: now,
    decisionSupportOnly: true
  });
};
