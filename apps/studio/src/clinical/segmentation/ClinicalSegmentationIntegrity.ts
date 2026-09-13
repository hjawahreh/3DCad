/**
 * PROD-002S — Segmentation state integrity contracts.
 *
 * Face membership is mesh-local face indices bound to a geometry fingerprint/revision.
 * Status is explicit: CURRENT | STALE | INVALID | NOT_AVAILABLE.
 * readyForMovement is never optimistic for heuristic / WARNING / stale / missing membership.
 */

import type { ClinicalMeshDescriptor } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { SegmentationPrediction } from './prediction/types.js';

export type SegmentationIntegrityStatus =
  | 'CURRENT'
  | 'STALE'
  | 'INVALID'
  | 'NOT_AVAILABLE';

export type SegmentationValidationVerdict = 'PASS' | 'WARNING' | 'FAIL';

/** Stable face-membership payload — mesh-local indices, not VTK/renderer ids. */
export interface SegmentationFaceMembershipV1 {
  readonly version: 'face-membership-v1';
  /** Face count of the mesh this membership was computed against. */
  readonly meshFaceCount: number;
  /** Per-instance sorted unique face indices (mesh-local). */
  readonly instances: readonly {
    readonly instanceId: string;
    readonly faceIndices: readonly number[];
  }[];
  /** Compact integrity fingerprint of membership (not a geometry backend id). */
  readonly membershipFingerprint: string;
}

export type SegmentationFaceMembership = SegmentationFaceMembershipV1;

export interface SegmentationIntegritySnapshot {
  readonly status: SegmentationIntegrityStatus;
  readonly reason: string | undefined;
  readonly providerId: string | undefined;
  readonly validationVerdict: SegmentationValidationVerdict | undefined;
  readonly geometryFingerprint: string | undefined;
  readonly sourceRevision: number | undefined;
  readonly currentGeometryFingerprint: string | undefined;
  readonly currentGeometryRevision: number | undefined;
  readonly hasFaceMembership: boolean;
  readonly faceMembershipFaceCount: number;
  readonly isHeuristicProvider: boolean;
  readonly isClinicallyReadyForMovement: boolean;
}

/** Known non-clinical / reference providers — never Movement-ready. */
export const NON_CLINICAL_SEGMENTATION_PROVIDERS = Object.freeze([
  'reference-heuristic',
  'REFERENCE_HEURISTIC',
  'scaffold',
  'mock'
] as const);

export const isNonClinicalSegmentationProvider = (providerId: string | undefined): boolean => {
  if (providerId === undefined || providerId.trim() === '') return true;
  const id = providerId.trim().toLowerCase();
  return NON_CLINICAL_SEGMENTATION_PROVIDERS.some((p) => p.toLowerCase() === id) ||
    id.includes('heuristic') ||
    id.includes('scaffold') ||
    id.includes('mock');
};

const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `mem:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

/** Build persisted face membership from a live prediction. */
export const buildFaceMembershipFromPrediction = (
  prediction: SegmentationPrediction,
  meshFaceCount?: number
): SegmentationFaceMembershipV1 => {
  const instances = prediction.instances.map((inst) => {
    const unique = [...new Set(inst.faceIndices.filter((f) => Number.isFinite(f) && f >= 0))]
      .map((f) => Math.trunc(f))
      .sort((a, b) => a - b);
    return Object.freeze({
      instanceId: inst.instanceId,
      faceIndices: Object.freeze(unique)
    });
  });
  let maxFace = -1;
  for (const inst of instances) {
    for (const f of inst.faceIndices) {
      if (f > maxFace) maxFace = f;
    }
  }
  const inferredFaces =
    meshFaceCount ??
    (typeof prediction.metrics.meshFaceCount === 'number'
      ? prediction.metrics.meshFaceCount
      : maxFace + 1);
  const fingerprintSeed = instances
    .map((i) => {
      const first = i.faceIndices[0] ?? -1;
      const last = i.faceIndices[i.faceIndices.length - 1] ?? -1;
      return `${i.instanceId}:${String(i.faceIndices.length)}:${String(first)}:${String(last)}`;
    })
    .join('|');
  return Object.freeze({
    version: 'face-membership-v1' as const,
    meshFaceCount: Math.max(0, Math.trunc(inferredFaces)),
    instances: Object.freeze(instances),
    membershipFingerprint: fnv1a(
      `${prediction.geometryFingerprint}|${String(prediction.sourceRevision)}|${fingerprintSeed}|n=${String(instances.length)}`
    )
  });
};

export const faceMembershipAssignedCount = (
  membership: SegmentationFaceMembership | undefined
): number => {
  if (membership === undefined) return 0;
  let n = 0;
  for (const inst of membership.instances) {
    n += inst.faceIndices.length;
  }
  return n;
};

export const faceMembershipHasIntegrity = (
  membership: SegmentationFaceMembership | undefined
): boolean => {
  if (membership === undefined) return false;
  if (membership.instances.length === 0) return false;
  if (faceMembershipAssignedCount(membership) <= 0) return false;
  // Detect duplicate face ownership across instances.
  const seen = new Set<number>();
  for (const inst of membership.instances) {
    for (const f of inst.faceIndices) {
      if (!Number.isFinite(f) || f < 0) return false;
      if (seen.has(f)) return false;
      seen.add(f);
    }
  }
  return membership.membershipFingerprint.length > 0;
};

/**
 * Evaluate whether descriptor segmentation is current relative to working geometry.
 * Does not invent clinical truth — only structural / provenance currency.
 */
export const evaluateSegmentationIntegrity = (
  obj: ClinicalMeshDescriptor
): SegmentationIntegritySnapshot => {
  const meta = obj.segmentationMeta;
  if (meta === undefined) {
    return Object.freeze({
      status: 'NOT_AVAILABLE',
      reason: 'No accepted segmentation metadata',
      providerId: undefined,
      validationVerdict: undefined,
      geometryFingerprint: undefined,
      sourceRevision: undefined,
      currentGeometryFingerprint: obj.geometryFingerprint,
      currentGeometryRevision: obj.geometryRevision,
      hasFaceMembership: false,
      faceMembershipFaceCount: 0,
      isHeuristicProvider: true,
      isClinicallyReadyForMovement: false
    });
  }

  const explicitStatus = meta.status;
  const membership = meta.faceMembership;
  const hasMembership = faceMembershipHasIntegrity(membership);
  const heuristic = isNonClinicalSegmentationProvider(meta.providerId);
  const currentFp = obj.geometryFingerprint;
  const currentRev = obj.geometryRevision;
  const boundFp = meta.geometryFingerprint;
  const boundRev = meta.sourceRevision;

  let status: SegmentationIntegrityStatus =
    explicitStatus ?? 'CURRENT';
  let reason: string | undefined = meta.staleReason;

  if (explicitStatus === 'INVALID') {
    status = 'INVALID';
    reason = reason ?? 'Segmentation marked invalid';
  } else if (explicitStatus === 'STALE') {
    status = 'STALE';
    reason = reason ?? 'Segmentation outdated — geometry changed';
  } else if (explicitStatus === 'NOT_AVAILABLE') {
    status = 'NOT_AVAILABLE';
  } else {
    // CURRENT (or legacy missing status): verify geometry binding.
    const fpMismatch =
      currentFp !== undefined && currentFp !== boundFp;
    const revMismatch =
      currentRev !== undefined && currentRev !== boundRev;
    if (fpMismatch || revMismatch) {
      status = 'STALE';
      reason = 'Segmentation geometry revision/fingerprint mismatch';
    } else if (!hasMembership) {
      status = 'INVALID';
      reason = 'Accepted segmentation missing face membership';
    } else {
      status = 'CURRENT';
      reason = undefined;
    }
  }

  const verdict = meta.validationVerdict;
  const clinicallyReady =
    status === 'CURRENT' &&
    hasMembership &&
    verdict === 'PASS' &&
    !heuristic &&
    (meta.needsReviewCount ?? 0) === 0;

  return Object.freeze({
    status,
    reason,
    providerId: meta.providerId,
    validationVerdict: verdict,
    geometryFingerprint: boundFp,
    sourceRevision: boundRev,
    currentGeometryFingerprint: currentFp,
    currentGeometryRevision: currentRev,
    hasFaceMembership: hasMembership,
    faceMembershipFaceCount: faceMembershipAssignedCount(membership),
    isHeuristicProvider: heuristic,
    isClinicallyReadyForMovement: clinicallyReady
  });
};

/** Mark segmentation stale after a geometry-mutating commit; preserve provenance. */
export const markSegmentationStaleOnGeometryCommit = (
  descriptor: ClinicalMeshDescriptor,
  reason: string
): ClinicalMeshDescriptor => {
  const meta = descriptor.segmentationMeta;
  if (meta === undefined) {
    return descriptor;
  }
  if (meta.status === 'STALE' && meta.staleReason === reason) {
    return descriptor;
  }
  return Object.freeze({
    ...descriptor,
    segmentationMeta: Object.freeze({
      ...meta,
      status: 'STALE' as const,
      staleReason: reason,
      // Keep faceMembership + provenance for history; no longer CURRENT.
      invalidatedAt: Date.now()
    })
  });
};

export const evaluateCaseMovementReadiness = (
  doc: ClinicalDocumentSnapshot
): {
  readonly readyForMovement: boolean;
  readonly notes: readonly string[];
  readonly arches: readonly SegmentationIntegritySnapshot[];
} => {
  const notes: string[] = [];
  const arches = doc.objects.map((o) => evaluateSegmentationIntegrity(o));
  const relevant = doc.objects.filter(
    (o) => o.archRole === 'upper' || o.archRole === 'lower' || doc.objects.length === 1
  );
  const targets = relevant.length > 0 ? relevant : doc.objects;

  if (targets.length === 0) {
    notes.push('No clinical objects');
    return Object.freeze({ readyForMovement: false, notes: Object.freeze(notes), arches: Object.freeze(arches) });
  }

  let ready = true;
  for (const obj of targets) {
    if (obj.archRole === undefined && targets.length > 1) {
      // Untyped extras do not gate movement when typed arches exist.
      continue;
    }
    const snap = evaluateSegmentationIntegrity(obj);
    if (snap.status !== 'CURRENT') {
      ready = false;
      notes.push(
        `${obj.displayName}: segmentation ${snap.status}${snap.reason !== undefined ? ` (${snap.reason})` : ''}`
      );
    }
    if (!snap.hasFaceMembership) {
      ready = false;
      notes.push(`${obj.displayName}: face membership missing`);
    }
    if (snap.validationVerdict === 'FAIL') {
      ready = false;
      notes.push(`${obj.displayName}: validation FAIL`);
    }
    if (snap.validationVerdict === 'WARNING') {
      ready = false;
      notes.push(`${obj.displayName}: validation WARNING is not clinical PASS`);
    }
    if (snap.validationVerdict !== 'PASS') {
      ready = false;
      if (snap.validationVerdict === undefined) {
        notes.push(`${obj.displayName}: validation verdict missing`);
      }
    }
    if (snap.isHeuristicProvider) {
      ready = false;
      notes.push(
        `${obj.displayName}: provider ${snap.providerId ?? 'unknown'} is non-clinical (reference/heuristic)`
      );
    }
    if (!snap.isClinicallyReadyForMovement) {
      ready = false;
    }
  }

  if (doc.orientationMeta?.acceptedAt === undefined) {
    ready = false;
    notes.push('Orientation not accepted');
  }
  if (doc.preparationMeta === undefined) {
    ready = false;
    notes.push('Preparation metadata missing');
  }

  // Honest default for current product: Movement not clinically certified.
  if (!ready && notes.length === 0) {
    notes.push('Not ready for Movement');
  }

  return Object.freeze({
    readyForMovement: ready,
    notes: Object.freeze(notes),
    arches: Object.freeze(arches)
  });
};

/** Operator-facing integrity label — never claims clinical Valid/Ready dishonestly. */
export const segmentationIntegrityUiLabel = (
  snap: SegmentationIntegritySnapshot
): string => {
  if (snap.status === 'NOT_AVAILABLE') return 'Segmentation not available';
  if (snap.status === 'STALE') {
    return snap.reason ?? 'Segmentation Outdated — Geometry Changed';
  }
  if (snap.status === 'INVALID') {
    return snap.reason ?? 'Segmentation Invalid';
  }
  if (snap.validationVerdict === 'FAIL') return 'Segmentation validation FAIL';
  if (snap.validationVerdict === 'WARNING' || snap.isHeuristicProvider) {
    return 'Review Required';
  }
  if (snap.validationVerdict === 'PASS' && snap.hasFaceMembership) {
    return 'Segmentation Current';
  }
  return 'Segmentation review pending';
};

export const movementReadinessUiLabel = (ready: boolean): string =>
  ready ? 'Ready for Movement' : 'Not Ready for Movement';
