/**
 * ClinicalSegmentationValidation — production PASS / WARNING / FAIL gate.
 * Does not mutate geometry. Compatible with automatic or fallback providers.
 *
 * FAIL blocks accept (unsafe downstream). WARNING remains reviewable after
 * acknowledgement. Heuristic limitations stay explicit — no fake clinical certainty.
 */

import { archOrderIndex, getFdiDefinition, isFdiInArchBank } from './fdi/FdiNumbering.js';
import {
  MAX_CLINICAL_TOOTH_INSTANCES,
  type SegmentationPrediction,
  type ToothInstancePrediction
} from './prediction/types.js';

export type SegmentationValidationVerdict = 'PASS' | 'WARNING' | 'FAIL';

export interface SegmentationValidationCheck {
  readonly id: string;
  readonly label: string;
  readonly verdict: SegmentationValidationVerdict;
  readonly message: string;
  readonly relatedInstanceIds?: readonly string[];
}

export interface ClinicalSegmentationValidationReport {
  readonly version: string;
  readonly predictionId: string;
  readonly providerId: string;
  readonly verdict: SegmentationValidationVerdict;
  readonly checks: readonly SegmentationValidationCheck[];
  readonly toothCount: number;
  readonly identifiedCount: number;
  readonly needsReviewCount: number;
  readonly fatalCheckIds: readonly string[];
  readonly validatedAt: number;
}

export const SEGMENTATION_VALIDATION_VERSION = 'clinical-seg-validation-v2';

/** Accept is blocked when validation verdict is FAIL. */
export const isSegmentationAcceptBlocked = (
  report: ClinicalSegmentationValidationReport | undefined
): boolean => report?.verdict === 'FAIL';

const freezeCheck = (c: SegmentationValidationCheck): SegmentationValidationCheck =>
  Object.freeze(c);

const overlapFaces = (
  a: ToothInstancePrediction,
  b: ToothInstancePrediction
): number => {
  const set = new Set(a.faceIndices);
  let n = 0;
  for (const f of b.faceIndices) {
    if (set.has(f)) n += 1;
  }
  return n;
};

const extentX = (inst: ToothInstancePrediction): number =>
  Math.abs(inst.bounds.max[0] - inst.bounds.min[0]);

const isFiniteVec3 = (v: readonly [number, number, number]): boolean =>
  Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid];
  if (a === undefined) return 0;
  if (sorted.length % 2 === 1) return a;
  const b = sorted[mid - 1];
  return b === undefined ? a : (a + b) / 2;
};

export const validateSegmentationPrediction = (
  prediction: SegmentationPrediction,
  options?: {
    readonly now?: number;
    readonly minTeeth?: number;
    /** Align with InstanceSeparation clinical cap (default 32). */
    readonly maxTeeth?: number;
    /** Optional mesh face count for index-bounds checks. */
    readonly meshFaceCount?: number;
    /** Declared clinical arch — FDI bank / consistency when known. */
    readonly archRole?: 'upper' | 'lower';
  }
): ClinicalSegmentationValidationReport => {
  const now = options?.now ?? Date.now();
  const minTeeth = options?.minTeeth ?? 1;
  const maxTeeth = options?.maxTeeth ?? MAX_CLINICAL_TOOTH_INSTANCES;
  const checks: SegmentationValidationCheck[] = [];
  const instances = prediction.instances;
  const rawGroups =
    typeof prediction.metrics.rawGroupCount === 'number'
      ? prediction.metrics.rawGroupCount
      : undefined;
  const capped =
    prediction.metrics.instanceCapped === 1 ||
    (rawGroups !== undefined && rawGroups > maxTeeth);

  // —— Tooth count ——
  const toothCount = instances.length;
  if (toothCount < minTeeth) {
    checks.push(
      freezeCheck({
        id: 'tooth-count-low',
        label: 'Tooth count',
        verdict: 'FAIL',
        message: `Only ${String(toothCount)} tooth instance(s); expected at least ${String(minTeeth)} — unsafe to accept`
      })
    );
  } else if (capped || toothCount >= maxTeeth) {
    checks.push(
      freezeCheck({
        id: 'instance-cap',
        label: 'Tooth count / cap',
        verdict: 'WARNING',
        message:
          rawGroups !== undefined && rawGroups > maxTeeth
            ? `Instance separation hit clinical cap (raw=${String(rawGroups)}, kept=${String(toothCount)}) — over-fragmentation; residual merged as UNCERTAIN`
            : `${String(toothCount)} instances at/near clinical max (${String(maxTeeth)}) — verify over-segmentation`
      })
    );
  } else if (toothCount > 20) {
    checks.push(
      freezeCheck({
        id: 'tooth-count-high',
        label: 'Tooth count',
        verdict: 'WARNING',
        message: `${String(toothCount)} tooth instances — unusually high for one arch; verify over-segmentation`
      })
    );
  } else {
    checks.push(
      freezeCheck({
        id: 'tooth-count',
        label: 'Tooth count',
        verdict: 'PASS',
        message: `${String(toothCount)} tooth instance(s)`
      })
    );
  }

  // —— Tooth IDs (stable uniqueness) ——
  const ids = new Set<string>();
  const dupIds: string[] = [];
  for (const inst of instances) {
    if (ids.has(inst.instanceId)) dupIds.push(inst.instanceId);
    ids.add(inst.instanceId);
  }
  checks.push(
    freezeCheck({
      id: 'stable-ids',
      label: 'Tooth IDs',
      verdict: dupIds.length === 0 ? 'PASS' : 'FAIL',
      message:
        dupIds.length === 0
          ? 'Instance IDs are unique'
          : `Duplicate instance IDs: ${dupIds.join(', ')}`,
      ...(dupIds.length > 0 ? { relatedInstanceIds: Object.freeze([...dupIds]) } : {})
    })
  );

  // —— Duplicate FDI assignments ——
  const fdiSeen = new Map<number, string>();
  const fdiDup: string[] = [];
  for (const inst of instances) {
    const fdi = inst.identification.fdi;
    if (fdi === undefined) continue;
    const prev = fdiSeen.get(fdi);
    if (prev !== undefined) {
      fdiDup.push(inst.instanceId, prev);
    } else {
      fdiSeen.set(fdi, inst.instanceId);
    }
  }
  checks.push(
    freezeCheck({
      id: 'fdi-unique',
      label: 'Duplicate assignments',
      verdict: fdiDup.length === 0 ? 'PASS' : 'FAIL',
      message:
        fdiDup.length === 0
          ? 'No duplicate FDI assignments'
          : 'Duplicate FDI assignments detected — unsafe',
      ...(fdiDup.length > 0
        ? { relatedInstanceIds: Object.freeze([...new Set(fdiDup)]) }
        : {})
    })
  );

  // —— Overlap ——
  let overlapPairs = 0;
  const overlapIds: string[] = [];
  for (let i = 0; i < instances.length; i += 1) {
    for (let j = i + 1; j < instances.length; j += 1) {
      const a = instances[i];
      const b = instances[j];
      if (a === undefined || b === undefined) continue;
      const shared = overlapFaces(a, b);
      if (shared > 0) {
        overlapPairs += 1;
        overlapIds.push(a.instanceId, b.instanceId);
      }
    }
  }
  checks.push(
    freezeCheck({
      id: 'overlap',
      label: 'Overlap',
      verdict: overlapPairs === 0 ? 'PASS' : 'FAIL',
      message:
        overlapPairs === 0
          ? 'No overlapping face assignments'
          : `${String(overlapPairs)} overlapping instance pair(s) — unsafe`,
      ...(overlapIds.length > 0
        ? { relatedInstanceIds: Object.freeze([...new Set(overlapIds)]) }
        : {})
    })
  );

  // —— Invalid geometry + topology (face lists) ——
  const empty = instances.filter((i) => i.faceCount <= 0 || i.faceIndices.length === 0);
  const nonFinite: string[] = [];
  const faceCountMismatch: string[] = [];
  const dupFacesInInst: string[] = [];
  for (const inst of instances) {
    if (
      !isFiniteVec3(inst.centroid) ||
      !isFiniteVec3(inst.bounds.min) ||
      !isFiniteVec3(inst.bounds.max)
    ) {
      nonFinite.push(inst.instanceId);
    }
    if (inst.faceCount !== inst.faceIndices.length) {
      faceCountMismatch.push(inst.instanceId);
    }
    const seen = new Set<number>();
    let dup = false;
    for (const f of inst.faceIndices) {
      if (seen.has(f)) {
        dup = true;
        break;
      }
      seen.add(f);
    }
    if (dup) dupFacesInInst.push(inst.instanceId);
  }
  checks.push(
    freezeCheck({
      id: 'empty-instances',
      label: 'Invalid geometry',
      verdict: empty.length === 0 ? 'PASS' : 'FAIL',
      message:
        empty.length === 0
          ? 'All instances have faces'
          : `${String(empty.length)} empty instance(s) — unsafe`,
      ...(empty.length > 0
        ? { relatedInstanceIds: Object.freeze(empty.map((e) => e.instanceId)) }
        : {})
    })
  );
  checks.push(
    freezeCheck({
      id: 'finite-geometry',
      label: 'Invalid geometry',
      verdict: nonFinite.length === 0 ? 'PASS' : 'FAIL',
      message:
        nonFinite.length === 0
          ? 'Centroids and bounds are finite'
          : `${String(nonFinite.length)} instance(s) have non-finite geometry — unsafe`,
      ...(nonFinite.length > 0
        ? { relatedInstanceIds: Object.freeze(nonFinite) }
        : {})
    })
  );
  checks.push(
    freezeCheck({
      id: 'topology-face-list',
      label: 'Topology',
      verdict:
        faceCountMismatch.length === 0 && dupFacesInInst.length === 0 ? 'PASS' : 'FAIL',
      message:
        faceCountMismatch.length === 0 && dupFacesInInst.length === 0
          ? 'Face lists are consistent (no duplicates / count mismatch)'
          : `Topology issue — count mismatch ${String(faceCountMismatch.length)}, duplicate faces ${String(dupFacesInInst.length)}`,
      ...(faceCountMismatch.length + dupFacesInInst.length > 0
        ? {
            relatedInstanceIds: Object.freeze([
              ...new Set([...faceCountMismatch, ...dupFacesInInst])
            ])
          }
        : {})
    })
  );

  // —— Disconnected fragments / boundary quality ——
  const tiny = instances.filter((i) => i.faceCount > 0 && i.faceCount < 8);
  const uncertainPresence = instances.filter((i) => i.presence === 'UNCERTAIN');
  checks.push(
    freezeCheck({
      id: 'disconnected-fragments',
      label: 'Disconnected fragments',
      verdict: tiny.length === 0 ? 'PASS' : 'WARNING',
      message:
        tiny.length === 0
          ? 'No tiny fragment instances'
          : `${String(tiny.length)} very small instance(s) — possible disconnected fragments`,
      ...(tiny.length > 0
        ? { relatedInstanceIds: Object.freeze(tiny.map((t) => t.instanceId)) }
        : {})
    })
  );
  checks.push(
    freezeCheck({
      id: 'boundary-quality',
      label: 'Boundary quality',
      verdict: tiny.length === 0 && uncertainPresence.length === 0 ? 'PASS' : 'WARNING',
      message:
        tiny.length === 0 && uncertainPresence.length === 0
          ? 'No obvious boundary/fragment quality issues'
          : `Boundary/quality review — tiny=${String(tiny.length)}, uncertainPresence=${String(uncertainPresence.length)}`,
      ...(tiny.length + uncertainPresence.length > 0
        ? {
            relatedInstanceIds: Object.freeze([
              ...new Set([
                ...tiny.map((t) => t.instanceId),
                ...uncertainPresence.map((u) => u.instanceId)
              ])
            ])
          }
        : {})
    })
  );

  // —— Merged teeth (geometric proxy: oversized X span vs median) ——
  const extents = instances.map((i) => extentX(i)).filter((e) => e > 1e-6);
  const medExtent = median(extents);
  const faceCounts = instances.map((i) => i.faceCount).filter((n) => n > 0);
  const medFaces = median(faceCounts);
  const mergedSuspects: string[] = [];
  if (medExtent > 1e-6 && toothCount >= 2) {
    for (const inst of instances) {
      const ex = extentX(inst);
      const oversized =
        ex > medExtent * 2.5 &&
        (medFaces <= 0 || inst.faceCount >= medFaces * 1.6);
      if (oversized || (capped && inst.presence === 'UNCERTAIN' && inst.faceCount >= medFaces)) {
        mergedSuspects.push(inst.instanceId);
      }
    }
  }
  checks.push(
    freezeCheck({
      id: 'merged-teeth',
      label: 'Merged teeth',
      verdict: mergedSuspects.length === 0 ? 'PASS' : 'WARNING',
      message:
        mergedSuspects.length === 0
          ? 'No oversized merge suspects vs median tooth span'
          : `${String(mergedSuspects.length)} instance(s) may contain merged teeth — split/review recommended`,
      ...(mergedSuspects.length > 0
        ? { relatedInstanceIds: Object.freeze(mergedSuspects) }
        : {})
    })
  );

  // —— Missing teeth ——
  const missingSlots = prediction.missingSlots;
  if (missingSlots.length > 0) {
    checks.push(
      freezeCheck({
        id: 'missing-slots',
        label: 'Missing teeth',
        verdict: 'WARNING',
        message: `${String(missingSlots.length)} expected FDI slot(s) missing (14-tooth bank, no wisdom)`
      })
    );
  } else {
    checks.push(
      freezeCheck({
        id: 'missing-slots',
        label: 'Missing teeth',
        verdict: 'PASS',
        message: 'No missing FDI slots reported'
      })
    );
  }

  // —— Confidence ——
  const needsReviewCount = prediction.confidence.needsReviewCount;
  checks.push(
    freezeCheck({
      id: 'confidence',
      label: 'Confidence',
      verdict:
        prediction.confidence.caseBand === 'needs-review' || needsReviewCount > 0
          ? 'WARNING'
          : prediction.confidence.caseBand === 'low'
            ? 'WARNING'
            : 'PASS',
      message: `Case band ${prediction.confidence.caseBand}; needsReview=${String(needsReviewCount)}`
    })
  );

  // —— Identification ——
  const identifiedCount = instances.filter(
    (i) => i.identification.status === 'IDENTIFIED' && i.identification.fdi !== undefined
  ).length;
  checks.push(
    freezeCheck({
      id: 'identification',
      label: 'Identification',
      verdict:
        identifiedCount === 0 && toothCount > 0
          ? 'WARNING'
          : identifiedCount < toothCount
            ? 'WARNING'
            : 'PASS',
      message: `${String(identifiedCount)}/${String(toothCount)} identified`
    })
  );

  if (prediction.warnings.length > 0) {
    checks.push(
      freezeCheck({
        id: 'provider-warnings',
        label: 'Provider warnings',
        verdict: 'WARNING',
        message: prediction.warnings.slice(0, 3).join('; ')
      })
    );
  }

  // —— Arch consistency + FDI bank ——
  const archRole = options?.archRole;
  const archesPresent = new Set<'upper' | 'lower'>();
  for (const inst of instances) {
    const fdi = inst.identification.fdi;
    if (fdi === undefined) continue;
    const def = getFdiDefinition(fdi);
    if (def !== undefined) archesPresent.add(def.arch);
  }
  if (archesPresent.size > 1) {
    checks.push(
      freezeCheck({
        id: 'arch-consistency',
        label: 'Arch consistency',
        verdict: 'FAIL',
        message: 'FDI assignments span both upper and lower arches — unsafe'
      })
    );
  } else if (archRole !== undefined && archesPresent.size === 1 && !archesPresent.has(archRole)) {
    checks.push(
      freezeCheck({
        id: 'arch-consistency',
        label: 'Arch consistency',
        verdict: 'FAIL',
        message: `Assigned FDI arch does not match declared ${archRole} — unsafe`
      })
    );
  } else {
    checks.push(
      freezeCheck({
        id: 'arch-consistency',
        label: 'Arch consistency',
        verdict: 'PASS',
        message:
          archRole !== undefined
            ? `FDI arch consistent with declared ${archRole}`
            : archesPresent.size === 0
              ? 'No FDI arches to conflict'
              : `Single-arch FDI set (${[...archesPresent][0] ?? 'unknown'})`
      })
    );
  }

  if (archRole !== undefined) {
    const outOfBank: string[] = [];
    for (const inst of instances) {
      const fdi = inst.identification.fdi;
      if (fdi === undefined) continue;
      if (!isFdiInArchBank(archRole, fdi)) {
        outOfBank.push(inst.instanceId);
      }
    }
    checks.push(
      freezeCheck({
        id: 'fdi-arch-bank',
        label: 'Arch consistency',
        verdict: outOfBank.length === 0 ? 'PASS' : 'FAIL',
        message:
          outOfBank.length === 0
            ? `Assigned FDI within ${archRole} 14-tooth bank`
            : `${String(outOfBank.length)} FDI assignment(s) outside ${archRole} bank — unsafe`,
        ...(outOfBank.length > 0
          ? { relatedInstanceIds: Object.freeze(outOfBank) }
          : {})
      })
    );
  }

  // —— Anatomical position (FDI order vs X-sort; heuristic) ——
  const identifiedSorted = [...instances]
    .filter((i) => i.identification.fdi !== undefined)
    .sort((a, b) => a.centroid[0] - b.centroid[0]);
  let inversions = 0;
  const inversionIds: string[] = [];
  for (let i = 1; i < identifiedSorted.length; i += 1) {
    const prev = identifiedSorted[i - 1];
    const cur = identifiedSorted[i];
    if (prev === undefined || cur === undefined) continue;
    const prevFdi = prev.identification.fdi;
    const curFdi = cur.identification.fdi;
    if (prevFdi === undefined || curFdi === undefined) continue;
    if (archOrderIndex(prevFdi) > archOrderIndex(curFdi)) {
      inversions += 1;
      inversionIds.push(prev.instanceId, cur.instanceId);
    }
  }
  if (identifiedSorted.length >= 2) {
    checks.push(
      freezeCheck({
        id: 'anatomical-position',
        label: 'Anatomical position',
        verdict: inversions === 0 ? 'PASS' : 'WARNING',
        message:
          inversions === 0
            ? 'Identified FDI order matches arch X-order'
            : `${String(inversions)} FDI order inversion(s) vs arch X-sort — review positions`,
        ...(inversionIds.length > 0
          ? { relatedInstanceIds: Object.freeze([...new Set(inversionIds)]) }
          : {})
      })
    );
  }

  // —— Neighbor relationships ——
  if (toothCount >= 2) {
    const idSet = new Set(instances.map((i) => i.instanceId));
    const missingNeighbors = instances.filter((i) => i.neighbors === undefined);
    const broken: string[] = [];
    for (const inst of instances) {
      const n = inst.neighbors;
      if (n === undefined) continue;
      if (n.archPreviousId !== undefined && !idSet.has(n.archPreviousId)) {
        broken.push(inst.instanceId);
      }
      if (n.archNextId !== undefined && !idSet.has(n.archNextId)) {
        broken.push(inst.instanceId);
      }
    }
    if (broken.length > 0) {
      checks.push(
        freezeCheck({
          id: 'neighbors',
          label: 'Neighbor relationships',
          verdict: 'FAIL',
          message: `${String(broken.length)} instance(s) reference missing neighbor IDs — unsafe`,
          relatedInstanceIds: Object.freeze([...new Set(broken)])
        })
      );
    } else if (missingNeighbors.length === toothCount) {
      checks.push(
        freezeCheck({
          id: 'neighbors',
          label: 'Neighbor relationships',
          verdict: 'WARNING',
          message:
            'No arch-order neighbors attached — optional for ONNX providers; contact geometry not claimed'
        })
      );
    } else if (missingNeighbors.length > 0) {
      checks.push(
        freezeCheck({
          id: 'neighbors',
          label: 'Neighbor relationships',
          verdict: 'WARNING',
          message: `${String(missingNeighbors.length)} instance(s) missing neighbor links`,
          relatedInstanceIds: Object.freeze(missingNeighbors.map((i) => i.instanceId))
        })
      );
    } else {
      checks.push(
        freezeCheck({
          id: 'neighbors',
          label: 'Neighbor relationships',
          verdict: 'WARNING',
          message: `Neighbor links present (${String(toothCount)}) — X-sort / low-confidence only, not contact detection`
        })
      );
    }
  }

  // —— Face index bounds (mesh) ——
  const meshFaceCount = options?.meshFaceCount;
  if (typeof meshFaceCount === 'number' && meshFaceCount > 0) {
    const invalid: string[] = [];
    for (const inst of instances) {
      for (const f of inst.faceIndices) {
        if (f < 0 || f >= meshFaceCount) {
          invalid.push(inst.instanceId);
          break;
        }
      }
    }
    // Also flag faceLabels OOB
    let badLabels = 0;
    for (const fl of prediction.faceLabels) {
      if (fl.faceIndex < 0 || fl.faceIndex >= meshFaceCount) badLabels += 1;
    }
    checks.push(
      freezeCheck({
        id: 'face-index-bounds',
        label: 'Invalid geometry',
        verdict: invalid.length === 0 && badLabels === 0 ? 'PASS' : 'FAIL',
        message:
          invalid.length === 0 && badLabels === 0
            ? 'All face indices within mesh'
            : `Invalid face indices — instances ${String(invalid.length)}, labels ${String(badLabels)} — unsafe`,
        ...(invalid.length > 0 ? { relatedInstanceIds: Object.freeze(invalid) } : {})
      })
    );
  }

  const fatalCheckIds = Object.freeze(
    checks.filter((c) => c.verdict === 'FAIL').map((c) => c.id)
  );
  const hasFail = fatalCheckIds.length > 0;
  const hasWarn = checks.some((c) => c.verdict === 'WARNING');
  const verdict: SegmentationValidationVerdict = hasFail
    ? 'FAIL'
    : hasWarn
      ? 'WARNING'
      : 'PASS';

  return Object.freeze({
    version: SEGMENTATION_VALIDATION_VERSION,
    predictionId: prediction.predictionId,
    providerId: prediction.providerId,
    verdict,
    checks: Object.freeze(checks),
    toothCount,
    identifiedCount,
    needsReviewCount,
    fatalCheckIds,
    validatedAt: now
  });
};
