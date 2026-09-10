/**
 * Collision / closest-distance foundation — reuses CLN-008 SpatialIndex AABB queries.
 * Read-only; no geometry mutation.
 */

import { buildSpatialIndex } from '../../../geometry-kernel/spatial/SpatialIndex.js';
import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import type { AABB } from '../../../geometry-kernel/mesh/TriangleMesh.js';
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

export interface CollisionQueryResult {
  readonly intersectsAabb: boolean;
  readonly closestDistanceMm: number | undefined;
  readonly pointA: AnalysisVec3 | undefined;
  readonly pointB: AnalysisVec3 | undefined;
  readonly method: 'aabb-sample-vertices';
}

const expandAabb = (a: AABB, b: AABB): boolean =>
  a.min[0]! <= b.max[0]! &&
  a.max[0]! >= b.min[0]! &&
  a.min[1]! <= b.max[1]! &&
  a.max[1]! >= b.min[1]! &&
  a.min[2]! <= b.max[2]! &&
  a.max[2]! >= b.min[2]!;

/** Sampled closest vertex-pair distance using KD nearest queries. */
export const queryMeshCollision = (
  meshA: TriangleMesh,
  meshB: TriangleMesh,
  sampleStride = 8
): CollisionQueryResult => {
  if (meshA.positions.length < 3 || meshB.positions.length < 3) {
    return Object.freeze({
      intersectsAabb: false,
      closestDistanceMm: undefined,
      pointA: undefined,
      pointB: undefined,
      method: 'aabb-sample-vertices'
    });
  }
  const indexA = buildSpatialIndex(meshA);
  const indexB = buildSpatialIndex(meshB);
  const intersectsAabb = expandAabb(indexA.meshAABB, indexB.meshAABB);

  let best = Number.POSITIVE_INFINITY;
  let pointA: AnalysisVec3 | undefined;
  let pointB: AnalysisVec3 | undefined;
  const countA = meshA.positions.length / 3;
  for (let i = 0; i < countA; i += sampleStride) {
    const q = {
      x: meshA.positions[i * 3]!,
      y: meshA.positions[i * 3 + 1]!,
      z: meshA.positions[i * 3 + 2]!
    };
    const hit = indexB.nearestVertex(q);
    if (hit === undefined) continue;
    if (hit.distance < best) {
      best = hit.distance;
      pointA = Object.freeze(q);
      pointB = Object.freeze({
        x: meshB.positions[hit.index * 3]!,
        y: meshB.positions[hit.index * 3 + 1]!,
        z: meshB.positions[hit.index * 3 + 2]!
      });
    }
  }

  return Object.freeze({
    intersectsAabb,
    closestDistanceMm: Number.isFinite(best) ? best : undefined,
    pointA,
    pointB,
    method: 'aabb-sample-vertices'
  });
};

export const analyzeCollision = (
  meshA: TriangleMesh,
  meshB: TriangleMesh,
  now: number,
  sourceRevision: number
): ClinicalAnalysisResult => {
  if (meshA.positions.length < 3 || meshB.positions.length < 3) {
    return Object.freeze({
      analysisId: createAnalysisId('collision', now),
      analysisType: 'collision',
      sourceRevision,
      segmentationRevision: undefined,
      geometryFingerprint: meshA.fingerprint,
      algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.collision,
      validity: 'INVALID',
      warnings: Object.freeze(['Geometry is unsuitable for collision query.']),
      measurements: Object.freeze([]),
      payload: Object.freeze({}),
      timestamp: now,
      decisionSupportOnly: true
    });
  }

  const query = queryMeshCollision(meshA, meshB);
  const dist = query.closestDistanceMm;
  const validity =
    dist === undefined ? 'INCOMPLETE' : query.intersectsAabb && dist < 1e-3 ? 'WARNING' : 'VALID';

  return Object.freeze({
    analysisId: createAnalysisId('collision', now),
    analysisType: 'collision',
    sourceRevision,
    segmentationRevision: undefined,
    geometryFingerprint: `${meshA.fingerprint}|${meshB.fingerprint}`,
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.collision,
    validity,
    warnings: Object.freeze([
      'Collision uses sampled vertex nearest-neighbor — foundation for future tooth-tooth queries.'
    ]),
    measurements: Object.freeze(
      dist === undefined
        ? []
        : [
            Object.freeze({
              measurementId: createMeasurementId('collision', now),
              measurementType: 'collision' as const,
              sourceRevision,
              sourceObjectIds: Object.freeze([meshA.objectId, meshB.objectId]),
              geometricReferences: Object.freeze(['mesh-a', 'mesh-b']),
              value: Object.freeze({
                value: clampDisplay(dist, 2),
                unit: CANONICAL_LENGTH_UNIT,
                display: formatLengthMm(clampDisplay(dist, 2))
              }),
              validity,
              warnings: Object.freeze([]),
              computationVersion: ANALYSIS_ALGORITHM_VERSIONS.collision,
              timestamp: now,
              metadata: Object.freeze({
                intersectsAabb: query.intersectsAabb,
                method: query.method
              })
            })
          ]
    ),
    payload: Object.freeze({ query }),
    timestamp: now,
    decisionSupportOnly: true
  });
};
