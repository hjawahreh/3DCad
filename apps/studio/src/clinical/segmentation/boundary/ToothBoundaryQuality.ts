/**
 * CLN-SEG-001 — deterministic boundary quality metrics per tooth instance.
 * Does not manufacture high confidence.
 */

import type { SegmentationPrediction, ToothInstancePrediction } from '../prediction/types.js';

export interface ToothBoundaryQuality {
  readonly instanceId: string;
  readonly fdi: number | undefined;
  readonly boundaryLength: number;
  readonly boundaryConfidence: number;
  readonly adjacentLabelConsistency: number;
  readonly surfaceArea: number;
  readonly neighborConsistency: number;
  readonly lowConfidence: boolean;
}

const faceSet = (inst: ToothInstancePrediction): Set<number> => new Set(inst.faceIndices);

/**
 * Approximate boundary length as count of faces that have a neighboring face
 * (by ±1 index heuristic when adjacency map absent) with a different instance.
 * Prefer caller-supplied adjacency when available.
 */
export const computeToothBoundaryQuality = (input: {
  readonly prediction: SegmentationPrediction;
  readonly adjacency?: ReadonlyMap<number, readonly number[]>;
  readonly faceAreas?: Float32Array;
}): readonly ToothBoundaryQuality[] => {
  const { prediction, adjacency, faceAreas } = input;
  const owner = new Map<number, string>();
  prediction.instances.forEach((inst) => {
    for (const f of inst.faceIndices) owner.set(f, inst.instanceId);
  });

  return Object.freeze(
    prediction.instances.map((inst) => {
      const faces = faceSet(inst);
      let boundary = 0;
      let consistent = 0;
      let checks = 0;
      for (const f of faces) {
        const neighbors = adjacency?.get(f) ?? [f - 1, f + 1];
        let isBoundary = false;
        for (const nb of neighbors) {
          if (nb < 0) continue;
          checks += 1;
          const other = owner.get(nb);
          if (other === undefined || other === inst.instanceId) {
            consistent += 1;
          } else {
            isBoundary = true;
          }
        }
        if (isBoundary) boundary += 1;
      }
      const surfaceArea =
        faceAreas !== undefined
          ? inst.faceIndices.reduce((s, f) => s + (faceAreas[f] ?? 0), 0)
          : inst.faceCount;
      const adjacentLabelConsistency = checks === 0 ? 1 : consistent / checks;
      const neighborConsistency = adjacentLabelConsistency;
      const boundaryConfidence = Math.min(inst.confidence, adjacentLabelConsistency);
      const lowConfidence =
        inst.confidence < 0.5 ||
        boundaryConfidence < 0.45 ||
        adjacentLabelConsistency < 0.35 ||
        inst.identification.status === 'UNCERTAIN';
      return Object.freeze({
        instanceId: inst.instanceId,
        fdi: inst.identification.fdi,
        boundaryLength: boundary,
        boundaryConfidence,
        adjacentLabelConsistency,
        surfaceArea,
        neighborConsistency,
        lowConfidence
      });
    })
  );
};

/** Extract mesh edges that sit on a tooth↔tooth or tooth↔gingiva label boundary. */
export const extractSemanticBoundaryEdges = (input: {
  readonly indices: Uint32Array;
  readonly faceLabels: readonly { readonly faceIndex: number; readonly label: string }[];
  readonly faceToInstance: ReadonlyMap<number, string>;
}): Float32Array => {
  // Build undirected edge → faces
  const edgeFaces = new Map<string, number[]>();
  const faceCount = Math.floor(input.indices.length / 3);
  for (let f = 0; f < faceCount; f += 1) {
    const i0 = input.indices[f * 3]!;
    const i1 = input.indices[f * 3 + 1]!;
    const i2 = input.indices[f * 3 + 2]!;
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ] as const) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const list = edgeFaces.get(key);
      if (list !== undefined) list.push(f);
      else edgeFaces.set(key, [f]);
    }
  }

  const segments: number[] = [];
  // Caller must supply positions separately when building LineSegments; here we
  // return packed vertex-index pairs (a,b) as float for transport simplicity.
  for (const [key, faces] of edgeFaces) {
    if (faces.length !== 2) continue;
    const [f0, f1] = faces;
    const inst0 = input.faceToInstance.get(f0!);
    const inst1 = input.faceToInstance.get(f1!);
    const lab0 = input.faceLabels[f0!]?.label;
    const lab1 = input.faceLabels[f1!]?.label;
    const crossesInstance = inst0 !== inst1;
    const crossesSemantic =
      (lab0 === 'GINGIVA') !== (lab1 === 'GINGIVA') ||
      (lab0 === 'TOOTH' && lab1 === 'TOOTH' && crossesInstance);
    if (!crossesSemantic && !crossesInstance) continue;
    const [a, b] = key.split(':').map((x) => Number(x));
    segments.push(a!, b!);
  }
  return Float32Array.from(segments);
};
