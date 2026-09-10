/**
 * Model-independent boundary refinement — label consistency with neighbors.
 * Does not blindly smooth every boundary.
 */

import type { FaceSemanticPrediction, SemanticLabel } from '../prediction/types.js';

export const refineBoundaries = (input: {
  readonly faceLabels: readonly FaceSemanticPrediction[];
  readonly faceNormals: Float32Array;
  readonly faceCentroids: Float32Array;
  readonly adjacency: ReadonlyMap<number, readonly number[]>;
}): FaceSemanticPrediction[] => {
  const byFace = new Map(input.faceLabels.map((f) => [f.faceIndex, f]));
  const next: FaceSemanticPrediction[] = [];
  for (const fl of input.faceLabels) {
    const neighbors = input.adjacency.get(fl.faceIndex) ?? [];
    if (neighbors.length === 0 || fl.confidence >= 0.8) {
      next.push(fl);
      continue;
    }
    const votes = new Map<SemanticLabel, number>();
    votes.set(fl.label, fl.confidence);
    for (const n of neighbors) {
      const nl = byFace.get(n);
      if (nl === undefined) continue;
      votes.set(nl.label, (votes.get(nl.label) ?? 0) + nl.confidence);
    }
    let bestLabel = fl.label;
    let bestScore = -1;
    for (const [label, score] of votes) {
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }
    // Only flip low-confidence faces when neighbors strongly disagree.
    if (bestLabel !== fl.label && fl.confidence < 0.55 && bestScore > fl.confidence * 1.5) {
      next.push(
        Object.freeze({
          faceIndex: fl.faceIndex,
          label: bestLabel,
          confidence: Math.min(0.75, (fl.confidence + bestScore / (neighbors.length + 1)) / 2)
        })
      );
    } else {
      next.push(fl);
    }
  }
  return next;
};
