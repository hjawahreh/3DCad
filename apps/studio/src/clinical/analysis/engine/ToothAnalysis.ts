/**
 * Tooth geometric analysis — centroids, AABB dimensions, PCA orientation.
 * Estimates are geometric, not validated anatomical crown measurements.
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import type { ToothInstancePrediction } from '../../segmentation/prediction/types.js';
import {
  ANALYSIS_ALGORITHM_VERSIONS,
  createAnalysisId,
  createMeasurementId,
  type AnalysisFrame,
  type AnalysisVec3,
  type ClinicalAnalysisResult,
  type ClinicalMeasurementResult
} from '../types.js';
import {
  CANONICAL_LENGTH_UNIT,
  clampDisplay,
  formatLengthMm
} from '../units.js';
import { fromTuple, vDistance } from './VecMath.js';
import { estimateToothLocalFrame } from './ToothCoordinateSystem.js';
import { principalAxesFromPoints } from './PrincipalAxes.js';

export { principalAxesFromPoints };

export type CentroidMethod = 'geometric-mean' | 'area-weighted' | 'volume-proxy';

export interface ToothGeometrySummary {
  readonly instanceId: string;
  readonly fdi: number | undefined;
  readonly identificationStatus: string;
  readonly centroid: AnalysisVec3;
  readonly centroidMethod: CentroidMethod;
  readonly boundsMin: AnalysisVec3;
  readonly boundsMax: AnalysisVec3;
  /** AABB extents — geometric estimates, not anatomical crown width/height. */
  readonly extentX: number;
  readonly extentY: number;
  readonly extentZ: number;
  readonly surfaceAreaMm2: number | undefined;
  readonly volumeMm3: number | undefined;
  readonly frame: AnalysisFrame;
  readonly confidence: number;
}

const areaOfTriangle = (
  positions: Float32Array,
  i0: number,
  i1: number,
  i2: number
): number => {
  const ax = positions[i1 * 3]! - positions[i0 * 3]!;
  const ay = positions[i1 * 3 + 1]! - positions[i0 * 3 + 1]!;
  const az = positions[i1 * 3 + 2]! - positions[i0 * 3 + 2]!;
  const bx = positions[i2 * 3]! - positions[i0 * 3]!;
  const by = positions[i2 * 3 + 1]! - positions[i0 * 3 + 1]!;
  const bz = positions[i2 * 3 + 2]! - positions[i0 * 3 + 2]!;
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return 0.5 * Math.hypot(cx, cy, cz);
};

export const geometricCentroidFromVertices = (
  positions: Float32Array,
  vertexIndices: readonly number[]
): AnalysisVec3 => {
  if (vertexIndices.length === 0) {
    return Object.freeze({ x: 0, y: 0, z: 0 });
  }
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const vi of vertexIndices) {
    sx += positions[vi * 3]!;
    sy += positions[vi * 3 + 1]!;
    sz += positions[vi * 3 + 2]!;
  }
  const n = vertexIndices.length;
  return Object.freeze({ x: sx / n, y: sy / n, z: sz / n });
};

export const areaWeightedCentroid = (
  mesh: TriangleMesh,
  faceIndices: readonly number[]
): { readonly centroid: AnalysisVec3; readonly area: number } => {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let areaSum = 0;
  const { positions, indices } = mesh;
  for (const fi of faceIndices) {
    const base = fi * 3;
    const i0 = indices[base]!;
    const i1 = indices[base + 1]!;
    const i2 = indices[base + 2]!;
    const area = areaOfTriangle(positions, i0, i1, i2);
    if (area <= 0) continue;
    const cx =
      (positions[i0 * 3]! + positions[i1 * 3]! + positions[i2 * 3]!) / 3;
    const cy =
      (positions[i0 * 3 + 1]! + positions[i1 * 3 + 1]! + positions[i2 * 3 + 1]!) /
      3;
    const cz =
      (positions[i0 * 3 + 2]! + positions[i1 * 3 + 2]! + positions[i2 * 3 + 2]!) /
      3;
    sx += cx * area;
    sy += cy * area;
    sz += cz * area;
    areaSum += area;
  }
  if (areaSum <= 0) {
    return {
      centroid: Object.freeze({ x: 0, y: 0, z: 0 }),
      area: 0
    };
  }
  return {
    centroid: Object.freeze({
      x: sx / areaSum,
      y: sy / areaSum,
      z: sz / areaSum
    }),
    area: areaSum
  };
};

/** Signed volume proxy via divergence theorem (closed mesh assumed). */
export const volumeProxyMm3 = (
  mesh: TriangleMesh,
  faceIndices: readonly number[]
): number | undefined => {
  let vol = 0;
  const { positions, indices } = mesh;
  for (const fi of faceIndices) {
    const base = fi * 3;
    const i0 = indices[base]!;
    const i1 = indices[base + 1]!;
    const i2 = indices[base + 2]!;
    const x0 = positions[i0 * 3]!;
    const y0 = positions[i0 * 3 + 1]!;
    const z0 = positions[i0 * 3 + 2]!;
    const x1 = positions[i1 * 3]!;
    const y1 = positions[i1 * 3 + 1]!;
    const z1 = positions[i1 * 3 + 2]!;
    const x2 = positions[i2 * 3]!;
    const y2 = positions[i2 * 3 + 1]!;
    const z2 = positions[i2 * 3 + 2]!;
    vol +=
      (x0 * (y1 * z2 - y2 * z1) +
        x1 * (y2 * z0 - y0 * z2) +
        x2 * (y0 * z1 - y1 * z0)) /
      6;
  }
  const abs = Math.abs(vol);
  return abs > 1e-8 ? abs : undefined;
};

export const analyzeToothInstance = (
  mesh: TriangleMesh,
  instance: ToothInstancePrediction,
  now: number,
  sourceRevision: number,
  segmentationRevision: number | undefined
): ClinicalAnalysisResult => {
  const idStatus = instance.identification.status;
  if (instance.presence === 'MISSING') {
    return incompleteTooth(
      instance.instanceId,
      'MISSING',
      now,
      sourceRevision,
      segmentationRevision,
      mesh.fingerprint,
      'Tooth is marked missing'
    );
  }
  if (idStatus === 'UNCERTAIN' || idStatus === 'UNKNOWN') {
    // Still compute geometry with WARNING — identity uncertain.
  }

  const area = areaWeightedCentroid(mesh, instance.faceIndices);
  const centroidMethod: CentroidMethod =
    area.area > 0 ? 'area-weighted' : 'geometric-mean';
  const centroid =
    area.area > 0
      ? area.centroid
      : geometricCentroidFromVertices(mesh.positions, instance.vertexIndices);

  const boundsMin = fromTuple(instance.bounds.min);
  const boundsMax = fromTuple(instance.bounds.max);
  const extentX = Math.abs(boundsMax.x - boundsMin.x);
  const extentY = Math.abs(boundsMax.y - boundsMin.y);
  const extentZ = Math.abs(boundsMax.z - boundsMin.z);
  const volume = volumeProxyMm3(mesh, instance.faceIndices);
  const frame = estimateToothLocalFrame(mesh, instance, centroid);

  const warnings: string[] = [
    'Dimensions are geometric AABB extents — not anatomical crown width/height.'
  ];
  let validity: ClinicalAnalysisResult['validity'] = 'VALID';
  if (idStatus === 'UNCERTAIN') {
    validity = 'WARNING';
    warnings.push('Tooth identification confidence is moderate/uncertain.');
  } else if (idStatus === 'UNKNOWN') {
    validity = 'WARNING';
    warnings.push('Tooth identity is unknown.');
  }
  if (instance.faceIndices.length === 0) {
    validity = 'INVALID';
    warnings.push('No faces available for tooth geometry.');
  }

  const mk = (
    type: ClinicalMeasurementResult['measurementType'],
    label: string,
    value: number,
    unitDisplay: string
  ): ClinicalMeasurementResult =>
    Object.freeze({
      measurementId: createMeasurementId(label, now),
      measurementType: type,
      sourceRevision,
      sourceObjectIds: Object.freeze([mesh.objectId]),
      geometricReferences: Object.freeze([instance.instanceId]),
      value: Object.freeze({
        value: clampDisplay(value, 2),
        unit: CANONICAL_LENGTH_UNIT,
        display: unitDisplay
      }),
      validity,
      confidence: instance.confidence,
      warnings: Object.freeze([]),
      computationVersion: ANALYSIS_ALGORITHM_VERSIONS.tooth,
      timestamp: now,
      metadata: Object.freeze({ label, geometric: true })
    });

  const measurements = Object.freeze([
    mk('tooth-dimensions', 'extent-x', extentX, formatLengthMm(clampDisplay(extentX, 2))),
    mk('tooth-dimensions', 'extent-y', extentY, formatLengthMm(clampDisplay(extentY, 2))),
    mk('tooth-dimensions', 'extent-z', extentZ, formatLengthMm(clampDisplay(extentZ, 2))),
    mk(
      'tooth-position',
      'centroid',
      vDistance(centroid, Object.freeze({ x: 0, y: 0, z: 0 })),
      `${formatLengthMm(clampDisplay(centroid.x, 2))} / ${formatLengthMm(clampDisplay(centroid.y, 2))} / ${formatLengthMm(clampDisplay(centroid.z, 2))}`
    )
  ]);

  const summary: ToothGeometrySummary = Object.freeze({
    instanceId: instance.instanceId,
    fdi: instance.identification.fdi,
    identificationStatus: idStatus,
    centroid,
    centroidMethod,
    boundsMin,
    boundsMax,
    extentX,
    extentY,
    extentZ,
    surfaceAreaMm2: area.area > 0 ? area.area : undefined,
    volumeMm3: volume,
    frame,
    confidence: instance.confidence
  });

  return Object.freeze({
    analysisId: createAnalysisId('tooth', now),
    analysisType: 'tooth-dimensions',
    sourceRevision,
    segmentationRevision,
    geometryFingerprint: mesh.fingerprint,
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.tooth,
    validity,
    confidence: instance.confidence,
    warnings: Object.freeze(warnings),
    measurements,
    frames: Object.freeze([frame]),
    payload: Object.freeze({ summary, decisionSupportOnly: true }),
    timestamp: now,
    decisionSupportOnly: true
  });
};

const incompleteTooth = (
  instanceId: string,
  reason: string,
  now: number,
  sourceRevision: number,
  segmentationRevision: number | undefined,
  fingerprint: string | undefined,
  message: string
): ClinicalAnalysisResult =>
  Object.freeze({
    analysisId: createAnalysisId('tooth', now),
    analysisType: 'tooth-dimensions',
    sourceRevision,
    segmentationRevision,
    geometryFingerprint: fingerprint,
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.tooth,
    validity: 'INCOMPLETE',
    warnings: Object.freeze([message]),
    measurements: Object.freeze([]),
    payload: Object.freeze({ instanceId, reason }),
    timestamp: now,
    decisionSupportOnly: true
  });
