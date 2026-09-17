/**
 * CLN-SEG-001 — map worker output → model-neutral SegmentationPrediction.
 * Preserves sample→source correspondence; never invents teeth.
 */

import {
  IDENTIFICATION_VERSION,
  POSTPROCESSING_VERSION,
  PREPROCESSING_VERSION,
  confidenceBand,
  type FaceSemanticPrediction,
  type SegmentationPrediction,
  type ToothInstancePrediction,
  type ToothPresence
} from '../prediction/types.js';
import type { FdiNumber } from '../fdi/FdiNumbering.js';
import { isFdiNumber } from '../fdi/FdiNumbering.js';
import type { SegmentationWorkerInferResult } from './SegmentationWorkerClient.js';
import type { ValidatedWorkerInferResult } from './validateWorkerInferResult.js';

const asFdi = (value: number | null | undefined): FdiNumber | undefined => {
  if (value === null || value === undefined || value === 0) return undefined;
  return isFdiNumber(value) ? value : undefined;
};

export const mapWorkerResultToPrediction = (input: {
  readonly result: SegmentationWorkerInferResult | ValidatedWorkerInferResult;
  readonly objectId: string;
  readonly sourceRevision: number;
  readonly geometryFingerprint: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly faceCount: number;
  readonly checkpointSource?: string;
}): SegmentationPrediction => {
  const validated =
    'checkpointFingerprint' in input.result && 'result' in input.result
      ? (input.result as ValidatedWorkerInferResult)
      : undefined;
  const result = validated?.result ?? (input.result as SegmentationWorkerInferResult);
  const checkpointFingerprint = validated?.checkpointFingerprint;
  const { faceCount } = input;
  if (result.segmentationGeometryFingerprint !== input.geometryFingerprint) {
    throw new Error(
      `Worker fingerprint mismatch: got ${result.segmentationGeometryFingerprint}, expected ${input.geometryFingerprint}`
    );
  }

  const faceLabels: FaceSemanticPrediction[] = [];
  for (let f = 0; f < faceCount; f += 1) {
    const fdi = result.FDILabel[f] ?? 0;
    const conf = result.confidence[f] ?? 0.5;
    const label = fdi === 0 ? 'GINGIVA' : fdi > 0 ? 'TOOTH' : 'UNKNOWN';
    faceLabels.push(
      Object.freeze({
        faceIndex: f,
        label,
        confidence: Math.max(0, Math.min(1, conf))
      })
    );
  }

  const instances: ToothInstancePrediction[] = result.toothInstances
    .filter((t) => !t.missingCandidate && t.faceMembership.length > 0)
    .map((t) => {
      const fdi = asFdi(t.fdi);
      const presence: ToothPresence = t.missingCandidate ? 'MISSING' : 'PRESENT';
      const idStatus =
        fdi === undefined
          ? 'UNKNOWN'
          : t.lowConfidence
            ? 'UNCERTAIN'
            : 'IDENTIFIED';
      return Object.freeze({
        instanceId: t.instanceId,
        faceIndices: Object.freeze([...t.faceMembership]),
        vertexIndices: Object.freeze([...t.vertexMembership]),
        confidence: t.confidence,
        centroid: t.centroid,
        bounds: t.bounds,
        faceCount: t.faceMembership.length,
        presence,
        identification: Object.freeze({
          status: idStatus,
          fdi,
          confidence: t.confidence,
          candidates:
            fdi !== undefined
              ? Object.freeze([{ fdi, score: t.confidence }])
              : Object.freeze([])
        })
      } satisfies ToothInstancePrediction);
    });

  const missingSlots = result.missingCandidates
    .map((fdi) => asFdi(fdi))
    .filter((fdi): fdi is FdiNumber => fdi !== undefined)
    .map((fdi) =>
      Object.freeze({
        fdi,
        presence: 'MISSING' as ToothPresence
      })
    );

  const instanceMean =
    instances.length === 0
      ? 0
      : instances.reduce((s, i) => s + i.confidence, 0) / instances.length;
  const faceMean =
    faceLabels.length === 0
      ? 0
      : faceLabels.reduce((s, f) => s + f.confidence, 0) / faceLabels.length;
  const needsReviewCount = instances.filter(
    (i) =>
      i.identification.status === 'UNCERTAIN' ||
      i.identification.status === 'UNKNOWN' ||
      i.confidence < 0.5
  ).length;

  const warnings: string[] = [];
  if (result.device === 'CPU') {
    warnings.push('Inference ran on CPU (CUDA GPU unavailable or not selected).');
  }
  for (const t of result.toothInstances) {
    if (t.lowConfidence) {
      warnings.push(`LOW_CONFIDENCE instance ${t.instanceId}`);
    }
  }

  return Object.freeze({
    predictionId: `prod-${Date.now().toString(36)}`,
    sourceObjectId: input.objectId,
    sourceRevision: input.sourceRevision,
    geometryFingerprint: input.geometryFingerprint,
    providerId: input.providerId,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    preprocessingVersion: PREPROCESSING_VERSION,
    postprocessingVersion: POSTPROCESSING_VERSION,
    identificationVersion: IDENTIFICATION_VERSION,
    createdAt: Date.now(),
    faceLabels: Object.freeze(faceLabels),
    instances: Object.freeze(instances),
    missingSlots: Object.freeze(missingSlots),
    confidence: Object.freeze({
      faceMean,
      instanceMean,
      identificationMean: instanceMean,
      caseBand: confidenceBand(instanceMean),
      needsReviewCount
    }),
    warnings: Object.freeze(warnings),
    metrics: Object.freeze({
      totalMs: result.runtimeMs,
      preprocessMs: Number(result.stages.preprocessMs ?? 0),
      inferenceMs: Number(result.stages.inferenceMs ?? 0),
      postprocessMs: Number(result.stages.postprocessMs ?? 0),
      meshProjectionMs: Number(result.stages.meshProjectionMs ?? 0),
      visualRebuildMs: Number(result.stages.visualRebuildMs ?? 0),
      sampleCount: result.sampleToSource.sampleCount,
      inputVertexCount: result.preprocessing.inputVertexCount,
      inputTriangleCount: result.preprocessing.inputTriangleCount
    }),
    inferenceProvenance: Object.freeze({
      ...(checkpointFingerprint !== undefined ? { checkpointFingerprint } : {}),
      ...(input.checkpointSource !== undefined ? { checkpointSource: input.checkpointSource } : {}),
      device: result.device,
      runtimeMs: result.runtimeMs,
      workerModelName: String(result.modelMetadata.modelName ?? input.modelId),
      workerModelVersion: String(result.modelMetadata.modelVersion ?? input.modelVersion),
      sampleCount: result.sampleToSource.sampleCount,
      stages: Object.freeze({ ...result.stages })
    })
  });
};
