/**
 * Phase 8 — auto segmentation presentation / workflow tests.
 */

import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import {
  buildSegmentationFaceColors,
  SEGMENTATION_SEMANTIC_COLORS
} from '../../src/clinical/segmentation/display/ClinicalSegmentationColors.js';
import {
  summarizeReview,
  toUserFacingProgressMessage
} from '../../src/clinical/segmentation/display/ClinicalSegmentationPresentation.js';
import { ReferenceHeuristicProvider } from '../../src/clinical/segmentation/provider/ReferenceHeuristicProvider.js';
import { buildSyntheticDentalSurface } from '../../src/geometry-kernel/mesh/MeshRegistry.js';

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 91000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'Auto Seg' }).ok).toBe(true);
  return { host, clinical };
};

const mesh = (id: string, arch?: 'upper' | 'lower'): ClinicalMeshDescriptor =>
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
    ...(arch === undefined ? {} : { archRole: arch })
  });

const seed = (
  clinical: ReturnType<ClinicalBootstrap['bootstrap']>,
  objects: readonly ClinicalMeshDescriptor[]
) => {
  const doc = clinical.session.getPublicState().activeCase!;
  expect(clinical.session.applyDocument(withClinicalObjects(doc, objects, 91001), true).ok).toBe(
    true
  );
};

const prepareReady = async (clinical: ReturnType<ClinicalBootstrap['bootstrap']>) => {
  seed(clinical, [mesh('upper', 'upper'), mesh('lower', 'lower')]);
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.accept().ok).toBe(true);
  clinical.workspace.preparation.notifyOrientationComplete();
  expect(clinical.workspace.preparation.start().ok).toBe(true);
  expect(clinical.workspace.preparation.activateSession().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
  expect(clinical.workspace.preparation.session.getState().currentStage).toBe(
    'ready-for-segmentation'
  );
};

describe('progress copy', () => {
  it('maps provider stages to operator-facing messages', () => {
    expect(toUserFacingProgressMessage('Preparing scan…')).toBe('Preparing model');
    expect(toUserFacingProgressMessage('Separating teeth…')).toBe('Separating gingiva');
    expect(toUserFacingProgressMessage('onnx-runtime EP webgpu')).toBe('PROCESSING…');
  });
});

describe('semantic colors', () => {
  it('builds restrained face colors for semantic and instance modes', async () => {
    const provider = new ReferenceHeuristicProvider();
    await provider.initialize();
    const geom = buildSyntheticDentalSurface('viz', 1, { gridResolution: 10 });
    const preprocess = await provider.preprocess(geom, new AbortController().signal);
    const pred = await provider.infer({
      objectId: 'viz',
      sourceRevision: 0,
      geometryFingerprint: geom.fingerprint,
      mesh: geom,
      preprocess,
      identificationThreshold: 0.65,
      signal: new AbortController().signal,
      report: () => undefined
    });
    const faceCount = Math.floor(geom.indices.length / 3);
    const semantic = buildSegmentationFaceColors({
      prediction: pred,
      viewMode: 'semantic',
      selectedInstanceId: undefined,
      faceCount
    });
    expect(semantic.length).toBe(faceCount * 3);
    expect(SEGMENTATION_SEMANTIC_COLORS.GINGIVA).toBe(0x8f6b5c);
    const summary = summarizeReview(pred);
    expect(summary.toothCount).toBe(pred.instances.length);
    expect(summary.qualityLabel.length).toBeGreaterThan(0);
  });
});

describe('auto segmentation workflow', () => {
  it('one-click segmentTeeth reaches review without mutating document until accept', async () => {
    const { host, clinical } = await boot();
    await prepareReady(clinical);
    const before = clinical.session.getPublicState().activeCase!.revision;
    const result = await clinical.workspace.segmentation.segmentTeeth();
    expect(result.ok).toBe(true);
    const state = clinical.workspace.segmentation.session.getState();
    expect(state.phase).toBe('ready-for-review');
    expect(state.presentation).toBe('review');
    expect(state.prediction?.instances.length).toBeGreaterThan(0);
    expect(clinical.session.getPublicState().activeCase!.revision).toBe(before);
    if ((state.prediction?.confidence.needsReviewCount ?? 0) > 0) {
      expect(clinical.workspace.segmentation.acknowledgeReview().ok).toBe(true);
    }
    expect(await clinical.workspace.segmentation.accept()).toMatchObject({ ok: true });
    const meta =
      clinical.session.getPublicState().activeCase!.objects.find((o) => o.segmentationMeta)?.segmentationMeta;
    expect(meta?.teeth?.length).toBeGreaterThan(0);
    expect(meta?.providerId).toBe('reference-heuristic');
    clinical.runtime.dispose();
    host.dispose();
  });

  it('supports upper/lower arch switch and reject leaves scan unchanged', async () => {
    const { host, clinical } = await boot();
    await prepareReady(clinical);
    expect(clinical.workspace.segmentation.enter().ok).toBe(true);
    const switched = clinical.workspace.segmentation.setActiveArch('lower');
    expect(switched.ok).toBe(true);
    expect(clinical.workspace.segmentation.session.getState().targetObjectId).toBe(
      asClinicalObjectId('lower')
    );
    const before = clinical.session.getPublicState().activeCase!.revision;
    expect(await clinical.workspace.segmentation.runInference()).toMatchObject({ ok: true });
    clinical.workspace.segmentation.selectInstance(
      clinical.workspace.segmentation.session.getState().prediction!.instances[0]!.instanceId
    );
    expect(clinical.workspace.segmentation.session.getState().selectedInstanceId).toBeTruthy();
    expect(clinical.workspace.segmentation.setViewMode('fdi').ok).toBe(true);
    expect(clinical.workspace.segmentation.setViewMode('boundary').ok).toBe(true);
    expect(clinical.workspace.segmentation.reject().ok).toBe(true);
    expect(clinical.session.getPublicState().activeCase!.revision).toBe(before);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('failure presentation keeps prediction unset', async () => {
    const { host, clinical } = await boot();
    await prepareReady(clinical);
    expect(clinical.workspace.segmentation.enter().ok).toBe(true);
    expect(clinical.workspace.segmentation.setProvider('onnx-runtime').ok).toBe(false);
    // Force failure via unavailable provider id through registry after enter
    clinical.workspace.segmentation.session.setProvider('tsegformer');
    const failed = await clinical.workspace.segmentation.runInference();
    expect(failed.ok).toBe(false);
    expect(clinical.workspace.segmentation.session.getState().presentation).toBe('failed');
    expect(clinical.workspace.segmentation.session.getState().prediction).toBeUndefined();
    clinical.runtime.dispose();
    host.dispose();
  });
});
