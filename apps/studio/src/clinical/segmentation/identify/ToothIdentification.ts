/**
 * Tooth identification — separate from segmentation.
 * Never forces FDI when confidence is insufficient.
 */

import {
  expectedFdiForArchSlot,
  getFdiDefinition,
  type FdiNumber
} from '../fdi/FdiNumbering.js';
import type {
  FaceSemanticPrediction,
  ToothIdentificationPrediction,
  ToothInstancePrediction,
  ToothPresence
} from '../prediction/types.js';

export interface IdentificationResult {
  readonly instances: readonly ToothInstancePrediction[];
  readonly missingSlots: readonly {
    readonly fdi: FdiNumber;
    readonly presence: ToothPresence;
  }[];
  readonly warnings: readonly string[];
}

type PartialInstance = Omit<ToothInstancePrediction, 'identification'>;

export const identifyToothInstances = (input: {
  readonly instances: readonly PartialInstance[];
  readonly faceLabels: readonly FaceSemanticPrediction[];
  readonly arch: 'upper' | 'lower';
  readonly threshold: number;
  readonly expectedSlots: number;
}): IdentificationResult => {
  void input.faceLabels;
  const warnings: string[] = [];
  const sorted = [...input.instances].sort((a, b) => a.centroid[0] - b.centroid[0]);
  const identified: ToothInstancePrediction[] = [];
  const used = new Set<FdiNumber>();

  for (let i = 0; i < sorted.length; i += 1) {
    const inst = sorted[i]!;
    const expected = expectedFdiForArchSlot(input.arch, i, sorted.length);
    const candidates: { fdi: FdiNumber; score: number }[] = [];
    if (expected !== undefined) {
      candidates.push({ fdi: expected, score: 0.7 + Math.min(0.25, inst.confidence * 0.25) });
      const def = getFdiDefinition(expected);
      if (def !== undefined) {
        const neighbors = [expected - 1, expected + 1].filter((n) => getFdiDefinition(n));
        for (const n of neighbors) {
          candidates.push({ fdi: n as FdiNumber, score: 0.35 });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];
    let identification: ToothIdentificationPrediction;
    if (inst.presence !== 'PRESENT' || top === undefined) {
      identification = Object.freeze({
        status: 'UNKNOWN',
        fdi: undefined,
        confidence: 0.2,
        candidates: Object.freeze([])
      });
    } else if (top.score < input.threshold || used.has(top.fdi)) {
      identification = Object.freeze({
        status: 'UNCERTAIN',
        fdi: undefined,
        confidence: top.score,
        candidates: Object.freeze(candidates.slice(0, 3))
      });
      warnings.push(`Instance ${inst.instanceId} left UNCERTAIN (threshold ${String(input.threshold)})`);
    } else {
      used.add(top.fdi);
      identification = Object.freeze({
        status: 'IDENTIFIED',
        fdi: top.fdi,
        confidence: top.score,
        candidates: Object.freeze(candidates.slice(0, 3))
      });
    }
    identified.push(
      Object.freeze({
        ...inst,
        identification
      })
    );
  }

  const missingSlots: IdentificationResult['missingSlots'][number][] = [];
  const expectedAll =
    input.arch === 'upper'
      ? ([17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27] as FdiNumber[])
      : ([47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37] as FdiNumber[]);
  for (const fdi of expectedAll.slice(0, input.expectedSlots)) {
    if (!used.has(fdi)) {
      missingSlots.push(Object.freeze({ fdi, presence: 'MISSING' as const }));
    }
  }

  return {
    instances: Object.freeze(identified),
    missingSlots: Object.freeze(missingSlots),
    warnings: Object.freeze(warnings)
  };
};
