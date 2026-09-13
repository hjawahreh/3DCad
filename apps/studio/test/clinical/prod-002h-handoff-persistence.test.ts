/**
 * PROD-002H — clinical handoff + persistence roundtrip.
 */

import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { MemoryClinicalCasePersistence } from '../../src/clinical/case/ClinicalCasePersistence.js';
import { ClinicalWorkspace } from '../../src/clinical/workspace/ClinicalWorkspace.js';
import {
  createEmptyClinicalDocument,
  withClinicalObjects,
  type ClinicalDocumentSnapshot
} from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import {
  buildClinicalHandoffSnapshot,
  rebuildClinicalHandoffFromDocument,
  handoffContainsGeometryBackendLeak,
  CLINICAL_HANDOFF_VERSION,
  CLINICAL_HANDOFF_CONSUMERS
} from '../../src/clinical/handoff/ClinicalHandoffSnapshot.js';

const bootWithMemory = () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 93000 }
  });
  const runtimeBoot = new ClinicalBootstrap().bootstrap(host);
  const persistence = new MemoryClinicalCasePersistence();
  const workspace = new ClinicalWorkspace(runtimeBoot.session, undefined, persistence);
  return { host, session: runtimeBoot.session, workspace, persistence, runtime: runtimeBoot.runtime };
};

const attach = async (host: StudioCompositionRoot) => {
  expect(
    await host.attachViewport({
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      getContext: () => null
    })
  ).toBe(true);
};

const segmentedArch = (
  id: string,
  arch: 'upper' | 'lower',
  opts?: { readonly backendLeak?: string }
): ClinicalMeshDescriptor =>
  Object.freeze({
    id: asClinicalObjectId(id),
    displayName: id,
    sourceFile: `${id}.stl`,
    format: 'stl' as const,
    units: 'mm' as const,
    bounds: DEFAULT_MESH_BOUNDS,
    vertexCount: 100,
    faceCount: 200,
    importedAt: 1,
    visible: true,
    selectable: true,
    hierarchyParentId: undefined,
    importerId: 'studio-passthrough',
    sourceEntityId: id,
    displayState: 'default' as const,
    transform: IDENTITY_CLINICAL_TRANSFORM,
    archRole: arch,
    geometryFingerprint: `geo:${id}`,
    geometryRevision: 2,
    ...(opts?.backendLeak !== undefined ? { geometryBackend: opts.backendLeak } : {}),
    segmentationMeta: Object.freeze({
      predictionId: `pred-${id}`,
      providerId: 'reference-heuristic',
      modelId: 'clinical-reference-seg',
      modelVersion: '1.1.0',
      instanceCount: 2,
      caseBand: 'moderate',
      geometryFingerprint: `geo:${id}`,
      sourceRevision: 2,
      needsReviewCount: 0,
      validationVerdict: 'WARNING' as const,
      status: 'CURRENT' as const,
      faceMembership: Object.freeze({
        version: 'face-membership-v1' as const,
        meshFaceCount: 200,
        membershipFingerprint: `mem:${id}`,
        instances: Object.freeze([
          Object.freeze({
            instanceId: 'inst-001',
            faceIndices: Object.freeze([0, 1, 2, 3])
          }),
          Object.freeze({
            instanceId: 'inst-002',
            faceIndices: Object.freeze([4, 5, 6, 7])
          })
        ])
      }),
      teeth: Object.freeze([
        Object.freeze({
          instanceId: 'inst-001',
          fdi: arch === 'upper' ? 11 : 41,
          status: 'IDENTIFIED',
          confidence: 0.72,
          needsReview: false,
          faceCount: 40,
          centroid: Object.freeze([1, 2, 3] as const),
          localFrame: Object.freeze({
            origin: Object.freeze([1, 2, 3] as const),
            xAxis: Object.freeze([1, 0, 0] as const),
            yAxis: Object.freeze([0, 1, 0] as const),
            zAxis: Object.freeze([0, 0, 1] as const),
            confidence: 'low'
          }),
          neighbors: Object.freeze({
            archPreviousId: undefined,
            archNextId: 'inst-002',
            confidence: 'low',
            basis: 'arch-x-order'
          })
        }),
        Object.freeze({
          instanceId: 'inst-002',
          fdi: arch === 'upper' ? 21 : 31,
          status: 'IDENTIFIED',
          confidence: 0.68,
          needsReview: false,
          faceCount: 38,
          centroid: Object.freeze([4, 2, 3] as const),
          localFrame: Object.freeze({
            origin: Object.freeze([4, 2, 3] as const),
            xAxis: Object.freeze([1, 0, 0] as const),
            yAxis: Object.freeze([0, 1, 0] as const),
            zAxis: Object.freeze([0, 0, 1] as const),
            confidence: 'low'
          }),
          neighbors: Object.freeze({
            archPreviousId: 'inst-001',
            archNextId: undefined,
            confidence: 'low',
            basis: 'arch-x-order'
          })
        })
      ])
    })
  });

const movementReadyDoc = (): ClinicalDocumentSnapshot => {
  const empty = createEmptyClinicalDocument({
    now: 93_000,
    name: 'Handoff Case',
    patientName: 'Handoff Patient',
    patientId: 'P-H'
  });
  const withObjs = withClinicalObjects(
    empty,
    [
      segmentedArch('upper', 'upper', { backendLeak: 'vtk-http-worker-v1' }),
      segmentedArch('lower', 'lower')
    ],
    93_001
  );
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
      sourceFingerprint: 'geo:1',
      warningCount: 0,
      archCount: 2,
      preparedAt: 3,
      timingMs: 1,
      message: 'ok'
    })
  });
};

describe('PROD-002H handoff contract', () => {
  it('builds v2 provider-agnostic snapshot for declared consumers', () => {
    const snap = buildClinicalHandoffSnapshot({ document: movementReadyDoc(), now: 100 });
    expect(snap.version).toBe(CLINICAL_HANDOFF_VERSION);
    expect(snap.version).toBe('clinical-handoff-v2');
    expect(snap.intendedConsumers).toEqual([...CLINICAL_HANDOFF_CONSUMERS]);
    expect(snap.readyForMovement).toBe(false);
    expect(snap.notes.some((n) => /heuristic|WARNING|non-clinical/i.test(n))).toBe(true);
    expect(snap.segmentationValidationVerdict).toBe('WARNING');
    expect(snap.arches).toHaveLength(2);

    const upper = snap.arches.find((a) => a.archRole === 'upper');
    expect(upper).toBeDefined();
    expect(upper?.geometryFingerprint).toBe('geo:upper');
    expect(upper?.hasFaceMembership).toBe(true);
    expect(upper?.integrityStatus).toBe('CURRENT');
    expect(upper?.transform).toHaveLength(16);
    expect(upper?.validationVerdict).toBe('WARNING');
    expect(upper?.segmentation.providerId).toBe('reference-heuristic');
    expect(upper?.teeth.map((t) => t.instanceId)).toEqual(['inst-001', 'inst-002']);
    expect(upper?.teeth[0]?.localFrame?.confidence).toBe('low');
    expect(upper?.teeth[0]?.neighbors?.basis).toBe('arch-x-order');
    expect(upper?.teeth[0]?.confidence).toBe(0.72);

    expect(handoffContainsGeometryBackendLeak(snap)).toBe(false);
    expect(JSON.stringify(snap)).not.toMatch(/vtk-http-worker/i);
    expect(JSON.stringify(snap)).not.toContain('geometryBackend');
  });

  it('rebuilds identically from document (save/close/reopen contract)', () => {
    const doc = movementReadyDoc();
    const a = buildClinicalHandoffSnapshot({ document: doc, now: 1 });
    const b = rebuildClinicalHandoffFromDocument(doc, 1);
    expect(a.arches).toEqual(b.arches);
    expect(a.readyForMovement).toBe(b.readyForMovement);
    expect(a.segmentationValidationVerdict).toBe(b.segmentationValidationVerdict);
  });
});

describe('PROD-002H save / close / reopen', () => {
  it('persists tooth IDs, transforms, confidence, validation, fingerprints; restores handoff', async () => {
    const { host, session, workspace, persistence, runtime } = bootWithMemory();
    await attach(host);
    expect(session.newCase({ name: 'PROD-002H', patientName: 'Handoff Patient' }).ok).toBe(true);

    const doc = session.getPublicState().activeCase!;
    const objects = [
      segmentedArch('upper', 'upper', { backendLeak: 'vtk-native-worker-v1' }),
      segmentedArch('lower', 'lower')
    ];
    const withMeta: ClinicalDocumentSnapshot = Object.freeze({
      ...withClinicalObjects(doc, objects, 93001),
      orientationMeta: movementReadyDoc().orientationMeta,
      preparationMeta: movementReadyDoc().preparationMeta,
      dirty: true
    });
    expect(session.applyDocument(withMeta, true).ok).toBe(true);

    for (const obj of objects) {
      host.runtimes.kernel.registry.ensureSourceMesh(obj.id as string, { gridResolution: 8 });
    }

    const caseId = session.getPublicState().activeCase!.caseId;
    const saved = await workspace.cases.saveActiveCase(workspace);
    expect(saved.ok).toBe(true);
    const savedHandoff = workspace.cases.getLastHandoff();
    expect(savedHandoff?.version).toBe('clinical-handoff-v2');
    expect(savedHandoff?.readyForMovement).toBe(false);
    expect(savedHandoff !== undefined && handoffContainsGeometryBackendLeak(savedHandoff)).toBe(
      false
    );

    const persisted = await persistence.load(caseId);
    expect(persisted?.handoff?.version).toBe('clinical-handoff-v2');
    expect(persisted?.meshes.length).toBe(2);

    session.closeCase(true);
    host.runtimes.kernel.registry.clear();
    workspace.importCoordinator.objects.clear();
    expect(session.getPublicState().activeCase).toBeUndefined();

    const opened = await workspace.cases.openCase(workspace, caseId);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    expect(opened.value.objects).toHaveLength(2);
    const upper = opened.value.objects.find((o) => o.archRole === 'upper');
    expect(upper?.segmentationMeta?.teeth?.[0]?.instanceId).toBe('inst-001');
    expect(upper?.segmentationMeta?.teeth?.[0]?.confidence).toBe(0.72);
    expect(upper?.segmentationMeta?.validationVerdict).toBe('WARNING');
    expect(upper?.geometryFingerprint).toBe('geo:upper');
    expect(upper?.transform.elements).toEqual(IDENTITY_CLINICAL_TRANSFORM.elements);
    expect(upper?.segmentationMeta?.teeth?.[0]?.localFrame).toBeDefined();
    expect(upper?.segmentationMeta?.faceMembership?.instances[0]?.faceIndices).toEqual([0, 1, 2, 3]);
    expect(upper?.segmentationMeta?.status).toBe('CURRENT');
    expect(upper?.segmentationMeta?.providerId).toBe('reference-heuristic');

    const restored = workspace.cases.getLastHandoff();
    expect(restored?.version).toBe('clinical-handoff-v2');
    expect(restored?.readyForMovement).toBe(false);
    expect(restored?.arches.find((a) => a.archRole === 'upper')?.teeth[0]?.instanceId).toBe(
      'inst-001'
    );
    expect(restored !== undefined && handoffContainsGeometryBackendLeak(restored)).toBe(false);
    expect(host.runtimes.kernel.registry.getByObjectId('upper', 'source')).toBeDefined();

    runtime.dispose();
    host.dispose();
  });
});
