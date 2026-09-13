/**
 * Tooth identification — separate from segmentation.
 * Never forces FDI when confidence is insufficient.
 * FDI slots use the same 14-tooth arch bank as missingSlots (no wisdom).
 */

import {
  ARCH_ORDER_WITHOUT_WISDOM,
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

type PartialInstance = Omit<ToothInstancePrediction, 'identification' | 'neighbors'>;

/** Attach arch-order neighbors (X-sorted). Not contact geometry. */
export const attachArchOrderNeighbors = (
  instances: readonly ToothInstancePrediction[]
): readonly ToothInstancePrediction[] => {
  const sorted = [...instances].sort((a, b) => a.centroid[0] - b.centroid[0]);
  const byId = new Map(sorted.map((inst, index) => [inst.instanceId, index]));
  return Object.freeze(
    instances.map((inst) => {
      const index = byId.get(inst.instanceId);
      if (index === undefined) return inst;
      const prev = index > 0 ? sorted[index - 1] : undefined;
      const next = index < sorted.length - 1 ? sorted[index + 1] : undefined;
      return Object.freeze({
        ...inst,
        neighbors: Object.freeze({
          archPreviousId: prev?.instanceId,
          archNextId: next?.instanceId,
          confidence: 'low' as const,
          basis: 'arch-x-order' as const
        })
      });
    })
  );
};

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
  const bank = ARCH_ORDER_WITHOUT_WISDOM[input.arch];

  for (let i = 0; i < sorted.length; i += 1) {
    const inst = sorted[i]!;
    const expected = expectedFdiForArchSlot(input.arch, i, sorted.length);
    const candidates: { fdi: FdiNumber; score: number }[] = [];
    if (expected !== undefined) {
      // Cap identification score — heuristic slot mapping is not clinical-grade.
      const score = Math.min(0.82, 0.55 + Math.min(0.25, inst.confidence * 0.25));
      candidates.push({ fdi: expected, score });
      const def = getFdiDefinition(expected);
      if (def !== undefined) {
        const neighbors = [expected - 1, expected + 1].filter(
          (n) => getFdiDefinition(n) !== undefined && bank.includes(n as FdiNumber)
        );
        for (const n of neighbors) {
          candidates.push({ fdi: n as FdiNumber, score: 0.32 });
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
      if (warnings.length < 24) {
        warnings.push(
          `Instance ${inst.instanceId} left UNCERTAIN (threshold ${String(input.threshold)})`
        );
      }
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

  const withNeighbors = attachArchOrderNeighbors(identified);

  const missingSlots: IdentificationResult['missingSlots'][number][] = [];
  const expectedAll = bank;
  const slotLimit = Math.min(input.expectedSlots, expectedAll.length);
  for (const fdi of expectedAll.slice(0, slotLimit)) {
    if (!used.has(fdi)) {
      missingSlots.push(Object.freeze({ fdi, presence: 'MISSING' as const }));
    }
  }

  return {
    instances: withNeighbors,
    missingSlots: Object.freeze(missingSlots),
    warnings: Object.freeze(warnings)
  };
};
