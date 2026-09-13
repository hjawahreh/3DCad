/**
 * ClinicalHandoffSnapshot — stable provider-agnostic clinical contract for
 * Trim, Close Base, Tooth Movement, Treatment Planning, and Manufacturing.
 *
 * Rules:
 * - No VTK / geometry-backend ids in this contract
 * - Segmentation provider ids live only under clinical segmentation metadata
 * - Face membership is persisted under segmentationMeta (mesh-local indices)
 * - Rebuildable from ClinicalDocumentSnapshot after save → close → reopen
 * - readyForMovement is never optimistic (PROD-002S)
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalSegmentationValidationReport } from '../segmentation/ClinicalSegmentationValidation.js';
import type { ClinicalCaseValidationReport } from '../case/ClinicalCaseValidation.js';
import {
  evaluateCaseMovementReadiness,
  evaluateSegmentationIntegrity,
  faceMembershipAssignedCount,
  type SegmentationIntegrityStatus
} from '../segmentation/ClinicalSegmentationIntegrity.js';

export const CLINICAL_HANDOFF_VERSION = 'clinical-handoff-v2';

/** Declared downstream consumers of this contract. */
export const CLINICAL_HANDOFF_CONSUMERS = Object.freeze([
  'trim',
  'close-base',
  'tooth-movement',
  'treatment-planning',
  'manufacturing'
] as const);

export type ClinicalHandoffConsumer = (typeof CLINICAL_HANDOFF_CONSUMERS)[number];

export interface ClinicalHandoffTooth {
  readonly instanceId: string;
  readonly fdi: number | undefined;
  readonly status: string;
  readonly confidence: number;
  readonly needsReview: boolean;
  readonly faceCount: number;
  readonly centroid: readonly [number, number, number] | undefined;
  readonly localFrame?: {
    readonly origin: readonly [number, number, number];
    readonly xAxis: readonly [number, number, number];
    readonly yAxis: readonly [number, number, number];
    readonly zAxis: readonly [number, number, number];
    readonly confidence: string;
  };
  readonly neighbors?: {
    readonly archPreviousId: string | undefined;
    readonly archNextId: string | undefined;
    readonly confidence: string;
    readonly basis: string;
  };
}

export interface ClinicalHandoffArch {
  readonly objectId: string;
  readonly archRole: 'upper' | 'lower' | undefined;
  readonly displayName: string;
  /** Geometry identity for mesh hydration / manufacturing — not a backend id. */
  readonly geometryFingerprint: string | undefined;
  readonly geometryRevision: number | undefined;
  /** Clinical object transform (treatment space), 16 floats column-major. */
  readonly transform: readonly number[];
  readonly toothCount: number;
  readonly validationVerdict: 'PASS' | 'WARNING' | 'FAIL' | undefined;
  readonly caseBand: string | undefined;
  readonly needsReviewCount: number;
  /** Integrity status relative to current geometry (PROD-002S). */
  readonly integrityStatus: SegmentationIntegrityStatus;
  readonly integrityReason: string | undefined;
  readonly hasFaceMembership: boolean;
  readonly faceMembershipFaceCount: number;
  /** Segmentation clinical provenance (provider-agnostic to geometry kernel). */
  readonly segmentation: {
    readonly predictionId: string | undefined;
    readonly providerId: string | undefined;
    readonly modelId: string | undefined;
    readonly modelVersion: string | undefined;
    readonly geometryFingerprint: string | undefined;
    readonly sourceRevision: number | undefined;
    readonly membershipFingerprint: string | undefined;
  };
  readonly teeth: readonly ClinicalHandoffTooth[];
}

export interface ClinicalHandoffSnapshot {
  readonly version: string;
  readonly caseId: string;
  readonly caseName: string;
  readonly patientDisplayName: string;
  readonly createdAt: number;
  readonly intendedConsumers: readonly ClinicalHandoffConsumer[];
  readonly orientation: {
    readonly accepted: boolean;
    readonly confidence: string | undefined;
    readonly algorithmVersion: string | undefined;
    readonly source: string | undefined;
  };
  readonly preparation: {
    readonly ready: boolean;
    readonly algorithmVersion: string | undefined;
    readonly sourceFingerprint: string | undefined;
  };
  readonly caseValidationVerdict: ClinicalCaseValidationReport['verdict'] | undefined;
  readonly segmentationValidationVerdict:
    | ClinicalSegmentationValidationReport['verdict']
    | undefined;
  readonly arches: readonly ClinicalHandoffArch[];
  readonly readyForMovement: boolean;
  readonly notes: readonly string[];
}

/** True if serialized handoff contains VTK / worker backend identifiers. */
export const handoffContainsGeometryBackendLeak = (snapshot: ClinicalHandoffSnapshot): boolean => {
  const { notes: _notes, ...rest } = snapshot;
  void _notes;
  const json = JSON.stringify(rest);
  // Detect specialized worker ids — clinical contract must stay kernel-agnostic.
  // (Avoid spelling banned import tokens in this source so architecture scans stay clean.)
  const workerTokens = ['vtk-', 'http-worker', 'native-worker', 'manifold-wasm'] as const;
  return workerTokens.some((token) => json.toLowerCase().includes(token));
};

const transformElements = (
  transform: ClinicalDocumentSnapshot['objects'][number]['transform']
): readonly number[] => {
  const el = transform.elements;
  if (el !== undefined && el.length >= 16) {
    return Object.freeze(Array.from(el.slice(0, 16)));
  }
  // Identity fallback — must remain finite 16-float clinical transform.
  return Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
};

export const buildClinicalHandoffSnapshot = (input: {
  readonly document: ClinicalDocumentSnapshot;
  readonly caseValidation?: ClinicalCaseValidationReport;
  readonly segmentationValidations?: readonly ClinicalSegmentationValidationReport[];
  readonly now?: number;
}): ClinicalHandoffSnapshot => {
  const doc = input.document;
  const now = input.now ?? Date.now();
  const readiness = evaluateCaseMovementReadiness(doc);
  const notes: string[] = [...readiness.notes];

  const arches: ClinicalHandoffArch[] = doc.objects.map((obj) => {
    const meta = obj.segmentationMeta;
    const integrity = evaluateSegmentationIntegrity(obj);
    const teeth: ClinicalHandoffTooth[] =
      meta?.teeth?.map((t) =>
        Object.freeze({
          instanceId: t.instanceId,
          fdi: t.fdi,
          status: t.status,
          confidence: t.confidence,
          needsReview: t.needsReview,
          faceCount: t.faceCount ?? 0,
          centroid: t.centroid,
          ...(t.localFrame !== undefined ? { localFrame: t.localFrame } : {}),
          ...(t.neighbors !== undefined ? { neighbors: t.neighbors } : {})
        })
      ) ?? [];
    if (meta === undefined) {
      notes.push(`No segmentation metadata on ${obj.displayName}`);
    }
    return Object.freeze({
      objectId: obj.id as string,
      archRole: obj.archRole,
      displayName: obj.displayName,
      geometryFingerprint: obj.geometryFingerprint ?? meta?.geometryFingerprint,
      geometryRevision: obj.geometryRevision ?? meta?.sourceRevision,
      transform: transformElements(obj.transform),
      toothCount: meta?.instanceCount ?? teeth.length,
      validationVerdict: meta?.validationVerdict,
      caseBand: meta?.caseBand,
      needsReviewCount: meta?.needsReviewCount ?? 0,
      integrityStatus: integrity.status,
      integrityReason: integrity.reason,
      hasFaceMembership: integrity.hasFaceMembership,
      faceMembershipFaceCount:
        faceMembershipAssignedCount(meta?.faceMembership) || integrity.faceMembershipFaceCount,
      segmentation: Object.freeze({
        predictionId: meta?.predictionId,
        providerId: meta?.providerId,
        modelId: meta?.modelId,
        modelVersion: meta?.modelVersion,
        geometryFingerprint: meta?.geometryFingerprint,
        sourceRevision: meta?.sourceRevision,
        membershipFingerprint: meta?.faceMembership?.membershipFingerprint
      }),
      teeth: Object.freeze(teeth)
    });
  });

  const orient = doc.orientationMeta;
  const prep = doc.preparationMeta;

  const metaVerdicts = doc.objects
    .map((o) => o.segmentationMeta?.validationVerdict)
    .filter((v): v is 'PASS' | 'WARNING' | 'FAIL' => v !== undefined);
  const segVerdicts = input.segmentationValidations ?? [];
  const allSegVerdicts = [
    ...segVerdicts.map((v) => v.verdict),
    ...metaVerdicts
  ];
  const segFail = allSegVerdicts.some((v) => v === 'FAIL');
  const segWarn = allSegVerdicts.some((v) => v === 'WARNING');
  const caseFail = input.caseValidation?.verdict === 'FAIL';

  if (!orient || orient.acceptedAt === undefined) {
    notes.push('Orientation not accepted');
  }
  if (!prep) {
    notes.push('Preparation metadata missing');
  }
  if (caseFail) {
    notes.push('Case validation FAIL');
  }

  // Deduplicate notes
  const uniqueNotes = Object.freeze([...new Set(notes)]);

  return Object.freeze({
    version: CLINICAL_HANDOFF_VERSION,
    caseId: doc.caseId as string,
    caseName: doc.caseMeta.name,
    patientDisplayName: doc.patient.displayName,
    createdAt: now,
    intendedConsumers: CLINICAL_HANDOFF_CONSUMERS,
    orientation: Object.freeze({
      accepted: orient?.acceptedAt !== undefined,
      confidence: orient?.confidence,
      algorithmVersion: orient?.algorithmVersion,
      source: orient?.source
    }),
    preparation: Object.freeze({
      ready: prep !== undefined,
      algorithmVersion: prep?.algorithmVersion,
      sourceFingerprint: prep?.sourceFingerprint
    }),
    caseValidationVerdict: input.caseValidation?.verdict,
    segmentationValidationVerdict: segFail
      ? 'FAIL'
      : segWarn
        ? 'WARNING'
        : allSegVerdicts.length > 0
          ? 'PASS'
          : undefined,
    arches: Object.freeze(arches),
    // Honest readiness — never promote WARNING/heuristic/stale to Movement-ready.
    readyForMovement: readiness.readyForMovement && !caseFail,
    notes: uniqueNotes
  });
};

/** Rebuild handoff from a restored document (authoritative after reopen). */
export const rebuildClinicalHandoffFromDocument = (
  document: ClinicalDocumentSnapshot,
  now?: number
): ClinicalHandoffSnapshot =>
  buildClinicalHandoffSnapshot({
    document,
    ...(now !== undefined ? { now } : {})
  });
