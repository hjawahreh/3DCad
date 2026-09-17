/**
 * CLN-SEG-002 — explicit request/response validation for production worker I/O.
 * Fail closed: never map incomplete or mismatched payloads into a prediction.
 */

import { SegmentationError } from '../errors.js';
import type {
  SegmentationWorkerInferRequest,
  SegmentationWorkerInferResult
} from './SegmentationWorkerClient.js';

export interface ValidatedWorkerInferResult {
  readonly result: SegmentationWorkerInferResult;
  readonly checkpointFingerprint: string | undefined;
}

const isFiniteNumberArray = (value: unknown, minLen: number): value is readonly number[] =>
  Array.isArray(value) &&
  value.length >= minLen &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

export const validateWorkerInferRequest = (request: SegmentationWorkerInferRequest): void => {
  if (!request.geometryFingerprint || request.geometryFingerprint.length < 4) {
    throw new SegmentationError('INVALID_INPUT', 'Missing geometryFingerprint on infer request');
  }
  if (!Number.isFinite(request.sourceRevision) || request.sourceRevision < 0) {
    throw new SegmentationError('INVALID_INPUT', 'Invalid sourceRevision on infer request');
  }
  if (!request.objectId) {
    throw new SegmentationError('INVALID_INPUT', 'Missing objectId on infer request');
  }
  if (!(request.positions instanceof Float32Array) || request.positions.length < 9) {
    throw new SegmentationError('INVALID_INPUT', 'positions must be Float32Array with ≥3 vertices');
  }
  if (!(request.indices instanceof Uint32Array) || request.indices.length < 3) {
    throw new SegmentationError('INVALID_INPUT', 'indices must be Uint32Array with ≥1 triangle');
  }
};

export const validateWorkerInferResult = (input: {
  readonly result: unknown;
  readonly expectedFingerprint: string;
  readonly expectedRevision: number;
  readonly expectedArch: 'upper' | 'lower' | 'unknown';
  readonly faceCount: number;
}): ValidatedWorkerInferResult => {
  const raw = input.result as Partial<SegmentationWorkerInferResult> | null;
  if (raw === null || typeof raw !== 'object') {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker returned empty inference payload');
  }
  if (typeof raw.segmentationGeometryFingerprint !== 'string') {
    throw new SegmentationError(
      'INFERENCE_FAILED',
      'Worker result missing segmentationGeometryFingerprint'
    );
  }
  if (raw.segmentationGeometryFingerprint !== input.expectedFingerprint) {
    throw new SegmentationError(
      'INFERENCE_FAILED',
      `Worker fingerprint mismatch: got ${raw.segmentationGeometryFingerprint}, expected ${input.expectedFingerprint}`
    );
  }
  if (raw.geometryRevision !== input.expectedRevision) {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker geometry revision mismatch');
  }
  if (raw.arch !== input.expectedArch) {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker arch mismatch');
  }
  if (typeof raw.inferenceRunId !== 'string' || raw.inferenceRunId.length < 8) {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker inferenceRunId missing or invalid');
  }
  if (typeof raw.inferenceTimestamp !== 'number' || !Number.isFinite(raw.inferenceTimestamp)) {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker inferenceTimestamp missing or invalid');
  }
  if (
    !Array.isArray(raw.FDILabel) ||
    raw.FDILabel.length < input.faceCount ||
    !raw.FDILabel.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    const labelLen = Array.isArray(raw.FDILabel) ? String(raw.FDILabel.length) : 'n/a';
    throw new SegmentationError(
      'INFERENCE_FAILED',
      `Worker FDILabel length ${labelLen} < faceCount ${String(input.faceCount)}`
    );
  }
  if (!isFiniteNumberArray(raw.confidence, Math.min(1, input.faceCount))) {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker confidence array missing or invalid');
  }
  if (!Array.isArray(raw.toothInstances)) {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker toothInstances missing');
  }
  if (typeof raw.runtimeMs !== 'number' || !Number.isFinite(raw.runtimeMs)) {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker runtimeMs missing');
  }
  if (raw.modelMetadata === undefined || typeof raw.modelMetadata !== 'object') {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker modelMetadata missing');
  }
  if (
    raw.sampleToSource === undefined ||
    typeof raw.sampleToSource.sampleCount !== 'number' ||
    !Array.isArray(raw.sampleToSource.vertexIndex)
  ) {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker sampleToSource incomplete');
  }
  if (raw.preprocessing === undefined || typeof raw.preprocessing.inputVertexCount !== 'number') {
    throw new SegmentationError('INFERENCE_FAILED', 'Worker preprocessing metadata incomplete');
  }

  const meta = raw.modelMetadata as Record<string, string | number | boolean>;
  const checkpointFingerprint =
    typeof meta.checkpointFingerprint === 'string'
      ? meta.checkpointFingerprint
      : typeof meta.checkpointSha256 === 'string'
        ? meta.checkpointSha256
        : typeof meta.checkpointHash === 'string'
          ? meta.checkpointHash
          : undefined;

  return Object.freeze({
    result: raw as SegmentationWorkerInferResult,
    checkpointFingerprint
  });
};
