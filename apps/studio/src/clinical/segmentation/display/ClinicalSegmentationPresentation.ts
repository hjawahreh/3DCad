/**
 * Presentation helpers for auto-segmentation UX (Phase 8).
 * Display-only — never mutates authoritative geometry.
 */

import type { ToothInstancePrediction, SegmentationPrediction } from '../prediction/types.js';
import { bandLabel, confidenceBand } from '../prediction/types.js';
import { describeConfidence } from '../confidence/ConfidenceSystem.js';

export type SegmentationPresentationStatus =
  | 'idle'
  | 'segmenting'
  | 'rebuilding'
  | 'review'
  | 'failed';

export interface SegmentationReviewSummary {
  readonly toothCount: number;
  readonly needsReviewCount: number;
  readonly unknownCount: number;
  readonly missingCount: number;
  readonly qualityLabel: string;
  readonly caseBand: string;
}

export interface CompactToothMeta {
  readonly instanceId: string;
  readonly fdi: number | undefined;
  readonly status: string;
  readonly confidence: number;
  readonly needsReview: boolean;
}

export const USER_PROGRESS_STAGES = Object.freeze([
  'Preparing model',
  'Detecting teeth',
  'Separating gingiva',
  'Identifying teeth',
  'Rebuilding tooth regions'
] as const);

/** Map provider progress copy → operator-facing stages (no provider internals). */
export const toUserFacingProgressMessage = (raw: string | undefined): string => {
  if (raw === undefined || raw.length === 0) return 'Preparing model';
  const lower = raw.toLowerCase();
  if (lower.includes('prepar') || lower.includes('scan') || lower.includes('mesh')) {
    return 'Preparing model';
  }
  if (lower.includes('load') || lower.includes('model') || lower.includes('detect')) {
    return 'Detecting teeth';
  }
  if (lower.includes('analyz') || lower.includes('surface') || lower.includes('semantic')) {
    return 'Detecting teeth';
  }
  if (
    lower.includes('separat') ||
    lower.includes('instance') ||
    lower.includes('gingiva')
  ) {
    return 'Separating gingiva';
  }
  if (lower.includes('identif')) {
    return 'Identifying teeth';
  }
  if (lower.includes('onnx-runtime') || lower.includes('webgpu')) {
    return 'PROCESSING…';
  }
  if (
    lower.includes('refin') ||
    lower.includes('boundar') ||
    lower.includes('region') ||
    lower.includes('reconstr') ||
    lower.includes('build') ||
    lower.includes('rebuild')
  ) {
    return 'Rebuilding tooth regions';
  }
  return 'Preparing model';
};

export const summarizeReview = (prediction: SegmentationPrediction): SegmentationReviewSummary => {
  const needsReviewCount = prediction.instances.filter(
    (i) =>
      i.identification.status === 'UNCERTAIN' ||
      i.identification.status === 'UNKNOWN' ||
      i.confidence < 0.5
  ).length;
  const unknownCount = prediction.instances.filter(
    (i) => i.identification.status === 'UNKNOWN' || i.identification.fdi === undefined
  ).length;
  return Object.freeze({
    toothCount: prediction.instances.length,
    needsReviewCount,
    unknownCount,
    missingCount: prediction.missingSlots.length,
    qualityLabel: bandLabel(prediction.confidence.caseBand),
    caseBand: prediction.confidence.caseBand
  });
};

export const compactTeethMeta = (
  prediction: SegmentationPrediction
): readonly CompactToothMeta[] =>
  Object.freeze(
    prediction.instances.map((inst) => {
      const needsReview =
        inst.identification.status === 'UNCERTAIN' ||
        inst.identification.status === 'UNKNOWN' ||
        inst.confidence < 0.5;
      return Object.freeze({
        instanceId: inst.instanceId,
        fdi: inst.identification.fdi,
        status: inst.identification.status,
        confidence: inst.confidence,
        needsReview
      });
    })
  );

export const findInstanceByFace = (
  prediction: SegmentationPrediction,
  faceIndex: number
): ToothInstancePrediction | undefined => {
  for (const inst of prediction.instances) {
    if (inst.faceIndices.includes(faceIndex)) return inst;
  }
  return undefined;
};

export const toothInspectorModel = (
  inst: ToothInstancePrediction,
  arch: 'upper' | 'lower' | undefined
): {
  readonly title: string;
  readonly identity: string;
  readonly confidenceLabel: string;
  readonly archLabel: string;
  readonly reviewState: string;
} => {
  const fdi = inst.identification.fdi;
  const conf = describeConfidence(inst.identification.confidence || inst.confidence);
  let reviewState = 'Accepted';
  if (inst.identification.status === 'UNKNOWN') reviewState = 'Unknown';
  else if (inst.identification.status === 'UNCERTAIN' || conf.band === 'needs-review') {
    reviewState = 'Needs review';
  } else if (conf.band === 'low') reviewState = 'Low confidence';
  return Object.freeze({
    title: fdi !== undefined ? `FDI ${String(fdi)}` : 'Tooth (unidentified)',
    identity: fdi !== undefined ? String(fdi) : '—',
    confidenceLabel: conf.label,
    archLabel: arch === 'lower' ? 'Lower' : arch === 'upper' ? 'Upper' : '—',
    reviewState
  });
};

export const instanceWorldCentroid = (
  inst: ToothInstancePrediction,
  positions: Float32Array,
  indices: Uint32Array
): readonly [number, number, number] => {
  // Prefer prediction centroid if finite; else compute from faces
  if (
    Number.isFinite(inst.centroid[0]) &&
    Number.isFinite(inst.centroid[1]) &&
    Number.isFinite(inst.centroid[2])
  ) {
    return inst.centroid;
  }
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  for (const f of inst.faceIndices) {
    const i0 = indices[f * 3]!;
    const i1 = indices[f * 3 + 1]!;
    const i2 = indices[f * 3 + 2]!;
    sx += (positions[i0 * 3]! + positions[i1 * 3]! + positions[i2 * 3]!) / 3;
    sy += (positions[i0 * 3 + 1]! + positions[i1 * 3 + 1]! + positions[i2 * 3 + 1]!) / 3;
    sz += (positions[i0 * 3 + 2]! + positions[i1 * 3 + 2]! + positions[i2 * 3 + 2]!) / 3;
    n += 1;
  }
  if (n === 0) return Object.freeze([0, 0, 0] as const);
  return Object.freeze([sx / n, sy / n, sz / n] as const);
};

void confidenceBand;
