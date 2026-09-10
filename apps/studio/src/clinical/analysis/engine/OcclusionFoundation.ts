/**
 * Occlusal analysis foundation — closest-point relationship between two meshes.
 * Not full occlusion simulation / biomechanics.
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import {
  ANALYSIS_ALGORITHM_VERSIONS,
  createAnalysisId,
  type ClinicalAnalysisResult
} from '../types.js';
import { analyzeCollision, queryMeshCollision } from './CollisionQuery.js';

export const analyzeOcclusionFoundation = (
  upper: TriangleMesh | undefined,
  lower: TriangleMesh | undefined,
  now: number,
  sourceRevision: number
): ClinicalAnalysisResult => {
  if (upper === undefined || lower === undefined) {
    return Object.freeze({
      analysisId: createAnalysisId('occlusion', now),
      analysisType: 'occlusion',
      sourceRevision,
      segmentationRevision: undefined,
      geometryFingerprint: undefined,
      algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.occlusion,
      validity: 'INCOMPLETE',
      warnings: Object.freeze([
        'Occlusal analysis requires both upper and lower model meshes.'
      ]),
      measurements: Object.freeze([]),
      payload: Object.freeze({ contactCandidates: [] }),
      timestamp: now,
      decisionSupportOnly: true
    });
  }

  const base = analyzeCollision(upper, lower, now, sourceRevision);
  const query = queryMeshCollision(upper, lower, 12);
  return Object.freeze({
    ...base,
    analysisId: createAnalysisId('occlusion', now),
    analysisType: 'occlusion',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.occlusion,
    warnings: Object.freeze([
      ...base.warnings,
      'Occlusion foundation reports closest-point distance only — not contact simulation.'
    ]),
    payload: Object.freeze({
      query,
      contactCandidates:
        query.closestDistanceMm !== undefined && query.closestDistanceMm < 0.5
          ? Object.freeze([
              Object.freeze({
                distanceMm: query.closestDistanceMm,
                pointUpper: query.pointA,
                pointLower: query.pointB
              })
            ])
          : Object.freeze([])
    })
  });
};
