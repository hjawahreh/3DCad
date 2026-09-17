/**
 * Model-neutral segmentation prediction schema (CLN-009).
 * Compact references to source mesh — no duplicated vertex buffers.
 */

import type { FdiNumber } from '../fdi/FdiNumbering.js';

export type SemanticLabel = 'GINGIVA' | 'TOOTH' | 'UNKNOWN';

export type IdentificationStatus = 'IDENTIFIED' | 'UNCERTAIN' | 'UNKNOWN' | 'NOT_APPLICABLE';

export type ToothPresence = 'PRESENT' | 'MISSING' | 'UNCERTAIN' | 'NOT_EVALUABLE';

export type ConfidenceBand = 'high' | 'moderate' | 'low' | 'needs-review';

export interface FaceSemanticPrediction {
  readonly faceIndex: number;
  readonly label: SemanticLabel;
  readonly confidence: number;
}

export interface ToothInstancePrediction {
  readonly instanceId: string;
  readonly faceIndices: readonly number[];
  readonly vertexIndices: readonly number[];
  readonly confidence: number;
  readonly centroid: readonly [number, number, number];
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly faceCount: number;
  readonly presence: ToothPresence;
  readonly identification: ToothIdentificationPrediction;
  /**
   * Arch-order neighbors (X-sorted). Geometric proximity heuristic only —
   * not contact detection. Optional so ONNX providers may omit.
   */
  readonly neighbors?: {
    readonly archPreviousId: string | undefined;
    readonly archNextId: string | undefined;
    readonly confidence: 'low';
    readonly basis: 'arch-x-order';
  };
}

export interface ToothIdentificationPrediction {
  readonly status: IdentificationStatus;
  readonly fdi: FdiNumber | undefined;
  readonly confidence: number;
  readonly candidates: readonly {
    readonly fdi: FdiNumber;
    readonly score: number;
  }[];
}

export interface CaseConfidenceSummary {
  readonly faceMean: number;
  readonly instanceMean: number;
  readonly identificationMean: number;
  readonly caseBand: ConfidenceBand;
  readonly needsReviewCount: number;
}

export interface SegmentationPrediction {
  readonly predictionId: string;
  readonly sourceObjectId: string;
  readonly sourceRevision: number;
  readonly geometryFingerprint: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly preprocessingVersion: string;
  readonly postprocessingVersion: string;
  readonly identificationVersion: string;
  readonly createdAt: number;
  readonly faceLabels: readonly FaceSemanticPrediction[];
  readonly instances: readonly ToothInstancePrediction[];
  readonly missingSlots: readonly {
    readonly fdi: FdiNumber;
    readonly presence: ToothPresence;
  }[];
  readonly confidence: CaseConfidenceSummary;
  readonly warnings: readonly string[];
  readonly metrics: Readonly<Record<string, number>>;
  /**
   * CLN-SEG-002 — production inference provenance (optional; reference omits).
   * Persisted into segmentationMeta.inferenceMetadata / checkpointFingerprint on accept.
   */
  readonly inferenceProvenance?: {
    readonly arch: 'upper' | 'lower' | 'unknown';
    readonly inferenceRunId: string;
    readonly inferenceTimestamp: number;
    readonly checkpointFingerprint?: string;
    readonly checkpointSource?: string;
    readonly device?: string;
    readonly runtimeMs?: number;
    readonly workerModelName?: string;
    readonly workerModelVersion?: string;
    readonly sampleCount?: number;
    readonly stages?: Readonly<Record<string, number>>;
  };
}

export const PREPROCESSING_VERSION = 'seg-pre-1.0.0';
export const POSTPROCESSING_VERSION = 'seg-post-1.1.0';
export const IDENTIFICATION_VERSION = 'seg-id-1.1.0';

/** Clinical instance cap shared by separation + validation. */
export const MAX_CLINICAL_TOOTH_INSTANCES = 32;

export const confidenceBand = (value: number): ConfidenceBand => {
  if (value >= 0.85) return 'high';
  if (value >= 0.65) return 'moderate';
  if (value >= 0.4) return 'low';
  return 'needs-review';
};

export const bandLabel = (band: ConfidenceBand): string => {
  switch (band) {
    case 'high':
      return 'High confidence';
    case 'moderate':
      return 'Moderate confidence';
    case 'low':
      return 'Low confidence';
    case 'needs-review':
      return 'Needs review';
  }
};
