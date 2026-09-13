/**
 * Import → Segmentation pipeline status helpers (Phase 9).
 * Presentation/orchestration only — does not invent tooth counts.
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalPreparationStage } from '../preparation/ClinicalPreparationStage.js';
import type { ClinicalArchRole } from '../import/ClinicalMeshDescriptor.js';
import { evaluateSegmentationIntegrity } from '../segmentation/ClinicalSegmentationIntegrity.js';

export interface ArchSegmentationSummary {
  readonly arch: ClinicalArchRole;
  readonly objectId: string;
  readonly displayName: string;
  readonly accepted: boolean;
  /** True only when accepted segmentation is CURRENT with membership. */
  readonly current: boolean;
  readonly status: string;
  readonly toothCount: number;
  readonly needsReviewCount: number;
  readonly caseBand: string | undefined;
}

export interface CaseSegmentationSummary {
  readonly arches: readonly ArchSegmentationSummary[];
  readonly complete: boolean;
  readonly totalTeeth: number;
  readonly totalNeedsReview: number;
  readonly pendingArches: readonly ClinicalArchRole[];
}

const archObjects = (doc: ClinicalDocumentSnapshot) => {
  const upper = doc.objects.find((o) => o.archRole === 'upper');
  const lower = doc.objects.find((o) => o.archRole === 'lower');
  const untyped = doc.objects.filter((o) => o.archRole !== 'upper' && o.archRole !== 'lower');
  return { upper, lower, untyped };
};

/** Arches that must be segmented for case completion. */
export const requiredSegmentationArches = (
  doc: ClinicalDocumentSnapshot
): readonly ClinicalArchRole[] => {
  const { upper, lower, untyped } = archObjects(doc);
  if (upper !== undefined && lower !== undefined) {
    return Object.freeze(['upper', 'lower'] as const);
  }
  if (upper !== undefined) return Object.freeze(['upper'] as const);
  if (lower !== undefined) return Object.freeze(['lower'] as const);
  // Single untyped scan counts as one arch requirement via first object.
  if (untyped.length > 0) return Object.freeze(['upper'] as const);
  return Object.freeze([]);
};

export const summarizeCaseSegmentation = (
  doc: ClinicalDocumentSnapshot
): CaseSegmentationSummary => {
  const { upper, lower, untyped } = archObjects(doc);
  const rows: ArchSegmentationSummary[] = [];
  const push = (
    arch: ClinicalArchRole,
    obj: (typeof doc.objects)[number] | undefined
  ): void => {
    if (obj === undefined) return;
    const meta = obj.segmentationMeta;
    const integrity = evaluateSegmentationIntegrity(obj);
    const current = integrity.status === 'CURRENT' && integrity.hasFaceMembership;
    rows.push(
      Object.freeze({
        arch,
        objectId: obj.id as string,
        displayName: obj.displayName,
        accepted: meta !== undefined,
        current,
        status: integrity.status,
        toothCount: meta?.instanceCount ?? 0,
        needsReviewCount: meta?.needsReviewCount ?? 0,
        caseBand: meta?.caseBand
      })
    );
  };

  if (upper !== undefined || lower !== undefined) {
    push('upper', upper);
    push('lower', lower);
  } else if (untyped[0] !== undefined) {
    push('upper', untyped[0]);
  }

  const required = requiredSegmentationArches(doc);
  const pending = required.filter((arch) => {
    const row = rows.find((r) => r.arch === arch);
    // Complete only when CURRENT + membership — STALE after Trim/Close Base is not complete.
    return row === undefined || !row.current;
  });

  return Object.freeze({
    arches: Object.freeze(rows),
    complete: required.length > 0 && pending.length === 0,
    totalTeeth: rows.reduce((s, r) => s + r.toothCount, 0),
    totalNeedsReview: rows.reduce((s, r) => s + r.needsReviewCount, 0),
    pendingArches: Object.freeze(pending)
  });
};

export const isCaseSegmentationComplete = (doc: ClinicalDocumentSnapshot): boolean =>
  summarizeCaseSegmentation(doc).complete;

/**
 * Infer preparation stage from persisted document metadata.
 * Conservative: never claims movement-ready without accepted segmentation.
 */
export const inferPreparationStageFromDocument = (
  doc: ClinicalDocumentSnapshot
): ClinicalPreparationStage => {
  if (isCaseSegmentationComplete(doc)) {
    return 'ready-for-movement';
  }
  if (doc.objects.some((o) => o.segmentationMeta !== undefined)) {
    return 'ready-for-segmentation';
  }
  // Prefer clinical metadata over geometry-backend naming (no VTK/backend leak).
  if (doc.preparationMeta?.uiState === 'ready' || doc.preparationMeta !== undefined) {
    // If revision advanced after import, treat as past trim toward close-base / seg.
    if (doc.objects.some((o) => (o.geometryRevision ?? 0) > 0)) {
      return 'ready-for-segmentation';
    }
  }
  if (doc.objects.some((o) => (o.geometryRevision ?? 0) > 0)) {
    return 'ready-for-close-base';
  }
  if (doc.preparationMeta !== undefined || doc.orientationMeta?.acceptedAt !== undefined) {
    return 'ready-for-trim';
  }
  return 'orientation-complete';
};
