/**
 * PROD-002S — Segmentation state integrity matrix (A–M).
 */

import { describe, expect, it } from 'vitest';
import { applyClinicalGeometryCommitToDescriptor } from '../../src/clinical/geometry/ClinicalGeometryDocumentDelta.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import {
  createEmptyClinicalDocument,
  withClinicalObjects,
  type ClinicalDocumentSnapshot
} from '../../src/clinical/document/ClinicalDocument.js';
import {
  buildClinicalHandoffSnapshot,
  rebuildClinicalHandoffFromDocument
} from '../../src/clinical/handoff/ClinicalHandoffSnapshot.js';
import {
  isCaseSegmentationComplete,
  summarizeCaseSegmentation
} from '../../src/clinical/case/ClinicalPipelineStatus.js';
import {
  buildFaceMembershipFromPrediction,
  evaluateCaseMovementReadiness,
  evaluateSegmentationIntegrity,
  faceMembershipHasIntegrity,
  isNonClinicalSegmentationProvider,
  markSegmentationStaleOnGeometryCommit
} from '../../src/clinical/segmentation/ClinicalSegmentationIntegrity.js';
import { isSegmentationAcceptBlocked } from '../../src/clinical/segmentation/ClinicalSegmentationValidation.js';
import type { SegmentationPrediction } from '../../src/clinical/segmentation/prediction/types.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { MemoryClinicalCasePersistence } from '../../src/clinical/case/ClinicalCasePersistence.js';
import { ClinicalWorkspace } from '../../src/clinical/workspace/ClinicalWorkspace.js';

const membership = (ids: readonly (readonly [string, readonly number[]])[]) =>
  Object.freeze({
    version: 'face-membership-v1' as const,
    meshFaceCount: 32,
    membershipFingerprint: 'mem:test',
    instances: Object.freeze(
      ids.map(([instanceId, faceIndices]) =>
        Object.freeze({ instanceId, faceIndices: Object.freeze([...faceIndices]) })
      )
    )
  });

const baseObj = (
  id: string,
  arch: 'upper' | 'lower',
  meta?: ClinicalMeshDescriptor['segmentationMeta'],
  geometry?: { readonly fingerprint: string; readonly revision: number }
): ClinicalMeshDescriptor =>
  Object.freeze({
    id: asClinicalObjectId(id),
    displayName: id,
    sourceFile: `${id}.stl`,
    format: 'stl' as const,
    units: 'mm' as const,
    bounds: DEFAULT_MESH_BOUNDS,
    vertexCount: 96,
    faceCount: 32,
    importedAt: 1,
    visible: true,
    selectable: true,
    hierarchyParentId: undefined,
    importerId: 'studio-passthrough',
    sourceEntityId: id,
    displayState: 'default' as const,
    transform: IDENTITY_CLINICAL_TRANSFORM,
    archRole: arch,
    geometryFingerprint: geometry?.fingerprint ?? 'geo:v1',
    geometryRevision: geometry?.revision ?? 1,
    ...(meta !== undefined ? { segmentationMeta: meta } : {})
  });

const currentMeta = (opts?: {
  readonly verdict?: 'PASS' | 'WARNING' | 'FAIL';
  readonly providerId?: string;
  readonly fingerprint?: string;
  readonly revision?: number;
  readonly withMembership?: boolean;
}): NonNullable<ClinicalMeshDescriptor['segmentationMeta']> =>
  Object.freeze({
    predictionId: 'pred-1',
    providerId: opts?.providerId ?? 'reference-heuristic',
    modelId: 'clinical-reference-seg',
    modelVersion: '1.1.0',
    instanceCount: 2,
    caseBand: 'moderate',
    geometryFingerprint: opts?.fingerprint ?? 'geo:v1',
    sourceRevision: opts?.revision ?? 1,
    needsReviewCount: opts?.verdict === 'WARNING' ? 1 : 0,
    validationVerdict: opts?.verdict ?? 'WARNING',
    status: 'CURRENT' as const,
    acceptedAt: 10,
    ...(opts?.withMembership === false
      ? {}
      : {
          faceMembership: membership([
            ['t1', [0, 1, 2, 3]],
            ['t2', [4, 5, 6, 7]]
          ])
        }),
    teeth: Object.freeze([
      Object.freeze({
        instanceId: 't1',
        fdi: 11,
        status: 'IDENTIFIED',
        confidence: 0.8,
        needsReview: false,
        faceCount: 4
      }),
      Object.freeze({
        instanceId: 't2',
        fdi: 21,
        status: 'IDENTIFIED',
        confidence: 0.7,
        needsReview: false,
        faceCount: 4
      })
    ])
  });

const orientedPrepared = (objects: readonly ClinicalMeshDescriptor[]): ClinicalDocumentSnapshot => {
  const empty = createEmptyClinicalDocument({
    now: 1,
    name: 'PROD-002S',
    patientName: 'Integrity',
    patientId: 'P-S'
  });
  const withObjs = withClinicalObjects(empty, objects, 2);
  return Object.freeze({
    ...withObjs,
    orientationMeta: Object.freeze({
      algorithmVersion: 'clinical-auto-orient-v1',
      confidence: 'high' as const,
      source: 'auto' as const,
      method: 'pca',
      hasUpper: true,
      hasLower: true,
      warnings: Object.freeze([] as string[]),
      estimatedAt: 1,
      acceptedAt: 2
    }),
    preparationMeta: Object.freeze({
      algorithmVersion: 'prep-1',
      uiState: 'ready' as const,
      sourceFingerprint: 'geo:v1',
      warningCount: 0,
      archCount: objects.length,
      preparedAt: 3,
      timingMs: 1,
      message: 'ok'
    })
  });
};

const toyPrediction = (): SegmentationPrediction =>
  Object.freeze({
    predictionId: 'pred-toy',
    sourceObjectId: 'upper',
    sourceRevision: 1,
    geometryFingerprint: 'geo:v1',
    providerId: 'reference-heuristic',
    modelId: 'clinical-reference-seg',
    modelVersion: '1.1.0',
    preprocessingVersion: '1',
    postprocessingVersion: '1',
    identificationVersion: '1',
    createdAt: 1,
    faceLabels: Object.freeze([]),
    instances: Object.freeze([
      Object.freeze({
        instanceId: 't1',
        faceIndices: Object.freeze([0, 1, 2, 3]),
        vertexIndices: Object.freeze([0, 1, 2]),
        confidence: 0.8,
        centroid: Object.freeze([0, 0, 0] as const),
        bounds: Object.freeze({
          min: Object.freeze([0, 0, 0] as const),
          max: Object.freeze([1, 1, 1] as const)
        }),
        faceCount: 4,
        presence: 'present' as const,
        identification: Object.freeze({
          status: 'IDENTIFIED' as const,
          fdi: 11,
          confidence: 0.8,
          candidates: Object.freeze([])
        })
      })
    ]),
    missingSlots: Object.freeze([]),
    confidence: Object.freeze({
      caseBand: 'moderate' as const,
      needsReviewCount: 0,
      meanInstanceConfidence: 0.8,
      minInstanceConfidence: 0.8
    }),
    warnings: Object.freeze([]),
    metrics: Object.freeze({ meshFaceCount: 32 })
  }) as unknown as SegmentationPrediction;

describe('PROD-002S face membership + integrity', () => {
  it('A: accepted + unchanged geometry → CURRENT', () => {
    const obj = baseObj('upper', 'upper', currentMeta({ verdict: 'WARNING' }));
    const snap = evaluateSegmentationIntegrity(obj);
    expect(snap.status).toBe('CURRENT');
    expect(snap.hasFaceMembership).toBe(true);
  });

  it('B: accepted + Trim → STALE', () => {
    const before = baseObj('upper', 'upper', currentMeta());
    const after = applyClinicalGeometryCommitToDescriptor(before, {
      objectId: 'upper',
      revision: 2,
      fingerprint: 'geo:v2',
      vertexCount: 90,
      faceCount: 28,
      backend: 'hybrid-vtk-reference-v1'
    }, { invalidateSegmentationReason: 'Segmentation Outdated — Geometry Changed (Trim)' });
    expect(after.segmentationMeta?.status).toBe('STALE');
    expect(after.segmentationMeta?.faceMembership).toBeDefined();
    expect(evaluateSegmentationIntegrity(after).status).toBe('STALE');
    expect(isCaseSegmentationComplete(orientedPrepared([after, baseObj('lower', 'lower', currentMeta())]))).toBe(
      false
    );
  });

  it('C: accepted + Close Base → STALE', () => {
    const before = baseObj('lower', 'lower', currentMeta());
    const after = applyClinicalGeometryCommitToDescriptor(before, {
      objectId: 'lower',
      revision: 3,
      fingerprint: 'geo:v3',
      vertexCount: 100,
      faceCount: 40
    }, { invalidateSegmentationReason: 'Segmentation Outdated — Geometry Changed (Close Base)' });
    expect(after.segmentationMeta?.status).toBe('STALE');
    expect(after.segmentationMeta?.staleReason).toMatch(/Close Base/i);
  });

  it('D: face membership roundtrip shape is reconstructable', () => {
    const mem = buildFaceMembershipFromPrediction(toyPrediction(), 32);
    expect(mem.version).toBe('face-membership-v1');
    expect(mem.instances[0]?.faceIndices).toEqual([0, 1, 2, 3]);
    expect(faceMembershipHasIntegrity(mem)).toBe(true);
    const json = JSON.parse(JSON.stringify(mem));
    expect(faceMembershipHasIntegrity(json)).toBe(true);
  });

  it('E: save/reopen after geometry mutation preserves STALE', async () => {
    const host = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 1000 }
    });
    const runtimeBoot = new ClinicalBootstrap().bootstrap(host);
    const persistence = new MemoryClinicalCasePersistence();
    const workspace = new ClinicalWorkspace(runtimeBoot.session, undefined, persistence);
    await host.attachViewport({
      width: 64,
      height: 64,
      clientWidth: 64,
      clientHeight: 64,
      getContext: () => null
    });
    expect(runtimeBoot.session.newCase({ name: 'S', patientName: 'P' }).ok).toBe(true);
    const upper = applyClinicalGeometryCommitToDescriptor(
      baseObj('upper', 'upper', currentMeta()),
      {
        objectId: 'upper',
        revision: 2,
        fingerprint: 'geo:v2',
        vertexCount: 10,
        faceCount: 10
      },
      { invalidateSegmentationReason: 'Segmentation Outdated — Geometry Changed (Trim)' }
    );
    const lower = baseObj('lower', 'lower', currentMeta({ fingerprint: 'geo:v1', revision: 1 }));
    const doc = orientedPrepared([upper, lower]);
    expect(runtimeBoot.session.applyDocument(doc, true).ok).toBe(true);
    host.runtimes.kernel.registry.ensureSourceMesh('upper', { gridResolution: 4 });
    host.runtimes.kernel.registry.ensureSourceMesh('lower', { gridResolution: 4 });
    const caseId = runtimeBoot.session.getPublicState().activeCase!.caseId;
    expect((await workspace.cases.saveActiveCase(workspace)).ok).toBe(true);
    runtimeBoot.session.closeCase(true);
    const opened = await workspace.cases.openCase(workspace, caseId);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const restoredUpper = opened.value.objects.find((o) => o.archRole === 'upper');
    expect(restoredUpper?.segmentationMeta?.status).toBe('STALE');
    expect(restoredUpper?.segmentationMeta?.faceMembership?.instances[0]?.faceIndices).toEqual([
      0, 1, 2, 3
    ]);
    const handoff = rebuildClinicalHandoffFromDocument(opened.value);
    expect(handoff.arches.find((a) => a.archRole === 'upper')?.integrityStatus).toBe('STALE');
    expect(handoff.readyForMovement).toBe(false);
    runtimeBoot.runtime.dispose();
    host.dispose();
  });

  it('F: WARNING ≠ PASS for readiness', () => {
    const doc = orientedPrepared([
      baseObj('upper', 'upper', currentMeta({ verdict: 'WARNING', providerId: 'future-clinical-model' })),
      baseObj('lower', 'lower', currentMeta({ verdict: 'WARNING', providerId: 'future-clinical-model' }))
    ]);
    const readiness = evaluateCaseMovementReadiness(doc);
    expect(readiness.readyForMovement).toBe(false);
    expect(readiness.notes.some((n) => /WARNING/i.test(n))).toBe(true);
    const handoff = buildClinicalHandoffSnapshot({ document: doc });
    expect(handoff.readyForMovement).toBe(false);
    expect(handoff.segmentationValidationVerdict).toBe('WARNING');
  });

  it('G: FAIL blocks accept helper', () => {
    expect(
      isSegmentationAcceptBlocked({
        version: 'v',
        predictionId: 'p',
        providerId: 'x',
        verdict: 'FAIL',
        checks: [],
        toothCount: 0,
        identifiedCount: 0,
        needsReviewCount: 0,
        fatalCheckIds: ['x'],
        validatedAt: 1
      })
    ).toBe(true);
  });

  it('H: reference heuristic is never Movement-ready', () => {
    expect(isNonClinicalSegmentationProvider('reference-heuristic')).toBe(true);
    const doc = orientedPrepared([
      baseObj(
        'upper',
        'upper',
        currentMeta({ verdict: 'PASS', providerId: 'reference-heuristic' })
      ),
      baseObj(
        'lower',
        'lower',
        currentMeta({ verdict: 'PASS', providerId: 'reference-heuristic' })
      )
    ]);
    expect(evaluateCaseMovementReadiness(doc).readyForMovement).toBe(false);
  });

  it('I: missing face membership → not Movement-ready / INVALID', () => {
    const obj = baseObj('upper', 'upper', currentMeta({ withMembership: false, verdict: 'PASS', providerId: 'clinical-model-x' }));
    const snap = evaluateSegmentationIntegrity(obj);
    expect(snap.status).toBe('INVALID');
    expect(snap.hasFaceMembership).toBe(false);
    expect(snap.isClinicallyReadyForMovement).toBe(false);
  });

  it('J: geometry fingerprint mismatch → STALE', () => {
    const obj = baseObj(
      'upper',
      'upper',
      currentMeta({ fingerprint: 'geo:old', revision: 1 }),
      { fingerprint: 'geo:new', revision: 1 }
    );
    expect(evaluateSegmentationIntegrity(obj).status).toBe('STALE');
  });

  it('K/L: upper mutation does not stale lower; lower mutation does not stale upper', () => {
    const upper = baseObj('upper', 'upper', currentMeta({ fingerprint: 'geo:u', revision: 1 }), {
      fingerprint: 'geo:u',
      revision: 1
    });
    const lower = baseObj('lower', 'lower', currentMeta({ fingerprint: 'geo:l', revision: 1 }), {
      fingerprint: 'geo:l',
      revision: 1
    });
    const upperTrimmed = applyClinicalGeometryCommitToDescriptor(upper, {
      objectId: 'upper',
      revision: 2,
      fingerprint: 'geo:u2',
      vertexCount: 1,
      faceCount: 1
    });
    expect(evaluateSegmentationIntegrity(upperTrimmed).status).toBe('STALE');
    expect(evaluateSegmentationIntegrity(lower).status).toBe('CURRENT');

    const lowerClosed = markSegmentationStaleOnGeometryCommit(
      lower,
      'Segmentation Outdated — Geometry Changed (Close Base)'
    );
    expect(evaluateSegmentationIntegrity(lowerClosed).status).toBe('STALE');
    expect(evaluateSegmentationIntegrity(upper).status).toBe('CURRENT');
  });

  it('M: BOTH context validates arches independently', () => {
    const upper = applyClinicalGeometryCommitToDescriptor(
      baseObj('upper', 'upper', currentMeta({ fingerprint: 'geo:u', revision: 1 }), {
        fingerprint: 'geo:u',
        revision: 1
      }),
      { objectId: 'upper', revision: 2, fingerprint: 'geo:u2', vertexCount: 1, faceCount: 1 }
    );
    const lower = baseObj('lower', 'lower', currentMeta({ fingerprint: 'geo:l', revision: 1 }), {
      fingerprint: 'geo:l',
      revision: 1
    });
    const summary = summarizeCaseSegmentation(orientedPrepared([upper, lower]));
    expect(summary.arches.find((a) => a.arch === 'upper')?.status).toBe('STALE');
    expect(summary.arches.find((a) => a.arch === 'lower')?.status).toBe('CURRENT');
    expect(summary.complete).toBe(false);
    expect(summary.pendingArches).toContain('upper');
  });
});
