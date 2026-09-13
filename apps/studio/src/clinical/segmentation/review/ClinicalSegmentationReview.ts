/**
 * Human review operations — merge, split, relabel, unknown, missing, boundary.
 * Manual correction is authoritative after acceptance.
 *
 * Domain contract for future UI (no fake UI here):
 * - split / merge / reassign (FDI) / boundary correction / mark missing
 * Controllers call these mutators; validation must re-run after each edit.
 */

import { isFdiNumber, type FdiNumber } from '../fdi/FdiNumbering.js';
import { SegmentationError } from '../errors.js';
import type {
  SegmentationPrediction,
  SemanticLabel,
  ToothInstancePrediction,
  ToothPresence
} from '../prediction/types.js';
import { confidenceBand } from '../prediction/types.js';
import { attachArchOrderNeighbors } from '../identify/ToothIdentification.js';

export type ReviewActionType =
  | 'relabel-fdi'
  | 'relabel-semantic'
  | 'merge'
  | 'split'
  | 'mark-unknown'
  | 'mark-missing'
  | 'boundary-correct'
  | 'restore';

/** Declared manual-edit capabilities — UI may wire later without changing domain. */
export const SEGMENTATION_MANUAL_EDIT_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: 'split' as const,
    action: 'split' as ReviewActionType,
    description: 'Split one instance into two face sets'
  }),
  Object.freeze({
    id: 'merge' as const,
    action: 'merge' as ReviewActionType,
    description: 'Merge two instances into one'
  }),
  Object.freeze({
    id: 'reassign' as const,
    action: 'relabel-fdi' as ReviewActionType,
    description: 'Reassign FDI / mark unknown'
  }),
  Object.freeze({
    id: 'boundary-correction' as const,
    action: 'boundary-correct' as ReviewActionType,
    description: 'Correct semantic/boundary face labels'
  }),
  Object.freeze({
    id: 'mark-missing' as const,
    action: 'mark-missing' as ReviewActionType,
    description: 'Mark instance presence as MISSING'
  })
]);

export interface ReviewActionMeta {
  readonly type: ReviewActionType;
  readonly previous: unknown;
  readonly next: unknown;
  readonly reason: string;
  readonly timestamp: number;
  readonly sourcePredictionId: string;
}

const recomputeCaseConfidence = (
  instances: readonly ToothInstancePrediction[],
  faceLabels: SegmentationPrediction['faceLabels']
): SegmentationPrediction['confidence'] => {
  const instanceMean =
    instances.reduce((s, i) => s + i.confidence, 0) / Math.max(1, instances.length);
  const faceMean =
    faceLabels.reduce((s, f) => s + f.confidence, 0) / Math.max(1, faceLabels.length);
  const identificationMean =
    instances.reduce((s, i) => s + i.identification.confidence, 0) /
    Math.max(1, instances.length);
  const needsReviewCount = instances.filter(
    (i) =>
      i.identification.status === 'UNCERTAIN' ||
      i.identification.status === 'UNKNOWN' ||
      i.confidence < 0.5
  ).length;
  return Object.freeze({
    faceMean,
    instanceMean,
    identificationMean,
    caseBand: confidenceBand((faceMean + instanceMean + identificationMean) / 3),
    needsReviewCount
  });
};

const withNeighborsAndConfidence = (
  prediction: SegmentationPrediction,
  instances: readonly ToothInstancePrediction[],
  faceLabels: SegmentationPrediction['faceLabels'] = prediction.faceLabels
): SegmentationPrediction => {
  const linked = attachArchOrderNeighbors(instances);
  return Object.freeze({
    ...prediction,
    instances: linked,
    faceLabels,
    confidence: recomputeCaseConfidence(linked, faceLabels)
  });
};

export const relabelInstanceFdi = (
  prediction: SegmentationPrediction,
  instanceId: string,
  fdi: FdiNumber | undefined,
  reason = 'manual-relabel'
): { prediction: SegmentationPrediction; meta: ReviewActionMeta } => {
  if (fdi !== undefined && !isFdiNumber(fdi)) {
    throw new SegmentationError('REVIEW_INVALID', 'Invalid FDI number');
  }
  const previous = prediction.instances.find((i) => i.instanceId === instanceId);
  if (previous === undefined) {
    throw new SegmentationError('REVIEW_INVALID', `Unknown instance ${instanceId}`);
  }
  const instances = prediction.instances.map((inst) => {
    if (inst.instanceId !== instanceId) return inst;
    return Object.freeze({
      ...inst,
      identification: Object.freeze({
        status: fdi === undefined ? ('UNKNOWN' as const) : ('IDENTIFIED' as const),
        fdi,
        confidence: fdi === undefined ? 0.2 : 1,
        candidates: fdi === undefined ? Object.freeze([]) : Object.freeze([{ fdi, score: 1 }])
      })
    });
  });
  const next = withNeighborsAndConfidence(prediction, instances);
  return {
    prediction: next,
    meta: Object.freeze({
      type: 'relabel-fdi',
      previous: previous.identification,
      next: { fdi },
      reason,
      timestamp: Date.now(),
      sourcePredictionId: prediction.predictionId
    })
  };
};

export const mergeInstances = (
  prediction: SegmentationPrediction,
  aId: string,
  bId: string,
  reason = 'manual-merge'
): { prediction: SegmentationPrediction; meta: ReviewActionMeta } => {
  const a = prediction.instances.find((i) => i.instanceId === aId);
  const b = prediction.instances.find((i) => i.instanceId === bId);
  if (a === undefined || b === undefined) {
    throw new SegmentationError('REVIEW_INVALID', 'Merge requires two valid instances');
  }
  const faces = Object.freeze(
    [...new Set([...a.faceIndices, ...b.faceIndices])].sort((x, y) => x - y)
  );
  const verts = Object.freeze(
    [...new Set([...a.vertexIndices, ...b.vertexIndices])].sort((x, y) => x - y)
  );
  const merged: ToothInstancePrediction = Object.freeze({
    instanceId: `merged-${aId}-${bId}`,
    faceIndices: faces,
    vertexIndices: verts,
    confidence: Math.min(a.confidence, b.confidence),
    centroid: Object.freeze([
      (a.centroid[0] + b.centroid[0]) / 2,
      (a.centroid[1] + b.centroid[1]) / 2,
      (a.centroid[2] + b.centroid[2]) / 2
    ] as const),
    bounds: Object.freeze({
      min: Object.freeze([
        Math.min(a.bounds.min[0], b.bounds.min[0]),
        Math.min(a.bounds.min[1], b.bounds.min[1]),
        Math.min(a.bounds.min[2], b.bounds.min[2])
      ] as const),
      max: Object.freeze([
        Math.max(a.bounds.max[0], b.bounds.max[0]),
        Math.max(a.bounds.max[1], b.bounds.max[1]),
        Math.max(a.bounds.max[2], b.bounds.max[2])
      ] as const)
    }),
    faceCount: faces.length,
    presence: 'PRESENT' as ToothPresence,
    identification: Object.freeze({
      status: 'UNCERTAIN' as const,
      fdi: undefined,
      confidence: 0.3,
      candidates: Object.freeze([])
    })
  });
  const instances = Object.freeze([
    ...prediction.instances.filter((i) => i.instanceId !== aId && i.instanceId !== bId),
    merged
  ]);
  const next = withNeighborsAndConfidence(prediction, instances);
  return {
    prediction: next,
    meta: Object.freeze({
      type: 'merge',
      previous: { a: aId, b: bId },
      next: { instanceId: merged.instanceId },
      reason,
      timestamp: Date.now(),
      sourcePredictionId: prediction.predictionId
    })
  };
};

export const splitInstance = (
  prediction: SegmentationPrediction,
  instanceId: string,
  faceSetA: readonly number[],
  reason = 'manual-split'
): { prediction: SegmentationPrediction; meta: ReviewActionMeta } => {
  const source = prediction.instances.find((i) => i.instanceId === instanceId);
  if (source === undefined) {
    throw new SegmentationError('REVIEW_INVALID', `Unknown instance ${instanceId}`);
  }
  const setA = new Set(faceSetA);
  const facesA = source.faceIndices.filter((f) => setA.has(f));
  const facesB = source.faceIndices.filter((f) => !setA.has(f));
  if (facesA.length === 0 || facesB.length === 0) {
    throw new SegmentationError('REVIEW_INVALID', 'Split requires non-empty regions');
  }
  const make = (id: string, faces: readonly number[]): ToothInstancePrediction =>
    Object.freeze({
      instanceId: id,
      faceIndices: Object.freeze([...faces]),
      vertexIndices: Object.freeze([]),
      confidence: source.confidence * 0.9,
      centroid: source.centroid,
      bounds: source.bounds,
      faceCount: faces.length,
      presence: 'PRESENT' as ToothPresence,
      identification: Object.freeze({
        status: 'UNCERTAIN' as const,
        fdi: undefined,
        confidence: 0.25,
        candidates: Object.freeze([])
      })
    });
  const instances = Object.freeze([
    ...prediction.instances.filter((i) => i.instanceId !== instanceId),
    make(`${instanceId}-a`, facesA),
    make(`${instanceId}-b`, facesB)
  ]);
  const next = withNeighborsAndConfidence(prediction, instances);
  return {
    prediction: next,
    meta: Object.freeze({
      type: 'split',
      previous: { instanceId },
      next: { a: `${instanceId}-a`, b: `${instanceId}-b` },
      reason,
      timestamp: Date.now(),
      sourcePredictionId: prediction.predictionId
    })
  };
};

export const markInstanceUnknown = (
  prediction: SegmentationPrediction,
  instanceId: string
): { prediction: SegmentationPrediction; meta: ReviewActionMeta } =>
  relabelInstanceFdi(prediction, instanceId, undefined, 'mark-unknown');

/** Mark presence MISSING and clear FDI — supports future missing-tooth workflow. */
export const markInstanceMissing = (
  prediction: SegmentationPrediction,
  instanceId: string,
  reason = 'mark-missing'
): { prediction: SegmentationPrediction; meta: ReviewActionMeta } => {
  const previous = prediction.instances.find((i) => i.instanceId === instanceId);
  if (previous === undefined) {
    throw new SegmentationError('REVIEW_INVALID', `Unknown instance ${instanceId}`);
  }
  const instances = prediction.instances.map((inst) => {
    if (inst.instanceId !== instanceId) return inst;
    return Object.freeze({
      ...inst,
      presence: 'MISSING' as ToothPresence,
      identification: Object.freeze({
        status: 'NOT_APPLICABLE' as const,
        fdi: undefined,
        confidence: 0,
        candidates: Object.freeze([])
      })
    });
  });
  const next = withNeighborsAndConfidence(prediction, instances);
  return {
    prediction: next,
    meta: Object.freeze({
      type: 'mark-missing',
      previous: { presence: previous.presence, identification: previous.identification },
      next: { presence: 'MISSING' },
      reason,
      timestamp: Date.now(),
      sourcePredictionId: prediction.predictionId
    })
  };
};

export const markSemanticFaces = (
  prediction: SegmentationPrediction,
  faceIndices: readonly number[],
  label: SemanticLabel,
  reason = 'manual-semantic'
): { prediction: SegmentationPrediction; meta: ReviewActionMeta } => {
  const set = new Set(faceIndices);
  const faceLabels = Object.freeze(
    prediction.faceLabels.map((f) =>
      set.has(f.faceIndex)
        ? Object.freeze({ ...f, label, confidence: 1 })
        : f
    )
  );
  const next = withNeighborsAndConfidence(prediction, prediction.instances, faceLabels);
  const actionType: ReviewActionType = reason.includes('boundary')
    ? 'boundary-correct'
    : 'relabel-semantic';
  return {
    prediction: next,
    meta: Object.freeze({
      type: actionType,
      previous: faceIndices,
      next: { label },
      reason,
      timestamp: Date.now(),
      sourcePredictionId: prediction.predictionId
    })
  };
};
