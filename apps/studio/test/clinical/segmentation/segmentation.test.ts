/**
 * CLN-009 segmentation tests.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClinicalApplication } from '../../../src/clinical/ClinicalApplication.js';
import { ClinicalBootstrap } from '../../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../../src/application/composition-root.js';
import { withClinicalObjects } from '../../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../../src/clinical/import/ClinicalMeshDescriptor.js';
import {
  ALL_FDI_NUMBERS,
  FDI_PERMANENT_TEETH,
  getFdiDefinition,
  isFdiNumber,
  antagonistFdi,
  contralateralFdi
} from '../../../src/clinical/segmentation/fdi/FdiNumbering.js';
import { createDefaultSegmentationRegistry } from '../../../src/clinical/segmentation/provider/SegmentationProviderRegistry.js';
import { ReferenceHeuristicProvider } from '../../../src/clinical/segmentation/provider/ReferenceHeuristicProvider.js';
import { OnnxSegmentationProvider } from '../../../src/clinical/segmentation/provider/adapters/OnnxSegmentationProvider.js';
import { detectInferenceRuntime } from '../../../src/clinical/segmentation/provider/adapters/InferenceCapabilityDetector.js';
import { buildSyntheticDentalSurface } from '../../../src/geometry-kernel/mesh/MeshRegistry.js';
import { mergeInstances, relabelInstanceFdi, splitInstance } from '../../../src/clinical/segmentation/review/ClinicalSegmentationReview.js';
import {
  runSegmentationBenchmarkSmoke,
  buildSegmentationModelComparison
} from '../../../src/clinical/segmentation/benchmark/SegmentationBenchmark.js';
import { planLargeMeshSampling } from '../../../src/clinical/segmentation/preprocess/LargeMeshSampling.js';
import { ConfidenceCalibrationTracker } from '../../../src/clinical/segmentation/confidence/ConfidenceSystem.js';

const segRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../src/clinical/segmentation'
);

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 90000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'Seg Case' }).ok).toBe(true);
  return { host, clinical };
};

const mesh = (id: string): ClinicalMeshDescriptor =>
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
    transform: IDENTITY_CLINICAL_TRANSFORM
  });

const seed = (
  clinical: ReturnType<ClinicalBootstrap['bootstrap']>,
  objects: readonly ClinicalMeshDescriptor[]
) => {
  const doc = clinical.session.getPublicState().activeCase!;
  expect(clinical.session.applyDocument(withClinicalObjects(doc, objects, 90001), true).ok).toBe(
    true
  );
};

const prepareSegmentationReady = async (
  clinical: ReturnType<ClinicalBootstrap['bootstrap']>
) => {
  seed(clinical, [mesh('jaw')]);
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.accept().ok).toBe(true);
  clinical.workspace.preparation.notifyOrientationComplete();
  expect(clinical.workspace.preparation.start().ok).toBe(true);
  expect(clinical.workspace.preparation.activateSession().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true); // trim
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true); // close-base
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true); // segmentation
  expect(clinical.workspace.preparation.session.getState().currentStage).toBe(
    'ready-for-segmentation'
  );
};

describe('fdi', () => {
  it('covers permanent dentition exhaustively', () => {
    expect(FDI_PERMANENT_TEETH).toHaveLength(32);
    expect(ALL_FDI_NUMBERS).toHaveLength(32);
    expect(isFdiNumber(11)).toBe(true);
    expect(isFdiNumber(50)).toBe(false);
    expect(getFdiDefinition(26)?.toothClass).toBe('first-molar');
    expect(antagonistFdi(11)).toBe(41);
    expect(contralateralFdi(11)).toBe(21);
  });
});

describe('provider registry', () => {
  it('registers reference operational and research scaffolds unavailable', () => {
    const registry = createDefaultSegmentationRegistry();
    expect(registry.list().length).toBeGreaterThanOrEqual(6);
    expect(registry.getDefault().info.id).toBe('reference-heuristic');
    expect(registry.get('onnx-runtime').info.operational).toBe(false);
    expect(registry.get('tsegformer').info.operational).toBe(false);
    expect(registry.get('meshsegnet').info.operational).toBe(false);
    expect(registry.get('tgnet').info.operational).toBe(false);
    expect(registry.get('dentalmae').info.operational).toBe(false);
  });

  it('rejects unavailable provider inference', async () => {
    const registry = createDefaultSegmentationRegistry();
    const meshGeom = buildSyntheticDentalSurface('x', 1, { gridResolution: 6 });
    await expect(
      registry.get('tsegformer').infer({
        objectId: 'x',
        sourceRevision: 0,
        geometryFingerprint: meshGeom.fingerprint,
        mesh: meshGeom,
        preprocess: await new ReferenceHeuristicProvider().preprocess(
          meshGeom,
          new AbortController().signal
        ),
        identificationThreshold: 0.65,
        signal: new AbortController().signal,
        report: () => undefined
      })
    ).rejects.toThrow(/unavailable/i);
  });
});

describe('reference provider', () => {
  it('produces semantic + instance prediction deterministically', async () => {
    const provider = new ReferenceHeuristicProvider();
    await provider.initialize();
    const meshGeom = buildSyntheticDentalSurface('arch', 1, { gridResolution: 16 });
    const preprocess = await provider.preprocess(meshGeom, new AbortController().signal);
    const a = await provider.infer({
      objectId: 'arch',
      sourceRevision: 0,
      geometryFingerprint: meshGeom.fingerprint,
      mesh: meshGeom,
      preprocess,
      identificationThreshold: 0.65,
      signal: new AbortController().signal,
      report: () => undefined
    });
    const b = await provider.infer({
      objectId: 'arch',
      sourceRevision: 0,
      geometryFingerprint: meshGeom.fingerprint,
      mesh: meshGeom,
      preprocess,
      identificationThreshold: 0.65,
      signal: new AbortController().signal,
      report: () => undefined
    });
    expect(a.faceLabels.length).toBe(Math.floor(meshGeom.indices.length / 3));
    expect(a.instances.length).toBeGreaterThan(0);
    expect(a.instances.map((i) => i.faceCount).reduce((s, n) => s + n, 0)).toBe(
      b.instances.map((i) => i.faceCount).reduce((s, n) => s + n, 0)
    );
    expect(a.warnings.some((w) => w.includes('decision support'))).toBe(true);
    expect(provider.runtimeInformation().cpuFallback).toBe(true);
    expect(provider.modelInformation().id).toBe('reference-heuristic');
  });

  it('reports Phase 7 progress stages and supports cancellation', async () => {
    const provider = new ReferenceHeuristicProvider();
    await provider.initialize();
    const meshGeom = buildSyntheticDentalSurface('cancel', 1, { gridResolution: 20 });
    const preprocess = await provider.preprocess(meshGeom, new AbortController().signal);
    const stages: string[] = [];
    const ac = new AbortController();
    const inferPromise = provider.infer({
      objectId: 'cancel',
      sourceRevision: 0,
      geometryFingerprint: meshGeom.fingerprint,
      mesh: meshGeom,
      preprocess,
      identificationThreshold: 0.65,
      signal: ac.signal,
      report: (p) => {
        stages.push(p.message);
        if (stages.length >= 2) {
          provider.cancel();
          ac.abort();
        }
      }
    });
    await expect(inferPromise).rejects.toThrow(/cancel/i);
    expect(stages.some((m) => m.includes('Preparing scan'))).toBe(true);
  });

  it('preserves large-mesh sample → source face mapping', async () => {
    const provider = new ReferenceHeuristicProvider();
    const meshGeom = buildSyntheticDentalSurface('large-map', 1, { gridResolution: 32 });
    const preprocess = await provider.preprocess(meshGeom, new AbortController().signal);
    const plan = planLargeMeshSampling(preprocess, { maxSampleFaces: 200, maxFacesPerChunk: 50 });
    expect(plan.mappingPreserved).toBe(true);
    expect(plan.sampledFaceIndices.length).toBeGreaterThan(0);
    expect(plan.chunks.length).toBeGreaterThan(0);
    expect(plan.chunks[0]!.sourceFaceIndices[0]).toBe(plan.sampledFaceIndices[0]);
  });
});

describe('onnx provider scaffold', () => {
  it('loads, reports runtime capability, and fails closed without weights', async () => {
    const provider = new OnnxSegmentationProvider();
    await provider.initialize();
    expect(provider.info.operational).toBe(false);
    expect(provider.runtimeInformation().cpuFallback).toBe(true);
    expect(provider.capabilities()).toContain('gpu');
    const meshGeom = buildSyntheticDentalSurface('onnx', 1, { gridResolution: 6 });
    const valid = provider.validateInput(meshGeom);
    expect(valid.ok).toBe(false);
    const preprocess = await provider.preprocess(meshGeom, new AbortController().signal);
    await expect(
      provider.infer({
        objectId: 'onnx',
        sourceRevision: 0,
        geometryFingerprint: meshGeom.fingerprint,
        mesh: meshGeom,
        preprocess,
        identificationThreshold: 0.65,
        signal: new AbortController().signal,
        report: () => undefined
      })
    ).rejects.toThrow(/unavailable/i);
  });

  it('honours cancellation before failure', async () => {
    const provider = new OnnxSegmentationProvider();
    await provider.initialize();
    provider.cancel();
    const meshGeom = buildSyntheticDentalSurface('onnx-c', 1, { gridResolution: 4 });
    const preprocess = await provider.preprocess(meshGeom, new AbortController().signal);
    await expect(
      provider.infer({
        objectId: 'onnx-c',
        sourceRevision: 0,
        geometryFingerprint: meshGeom.fingerprint,
        mesh: meshGeom,
        preprocess,
        identificationThreshold: 0.65,
        signal: new AbortController().signal,
        report: () => undefined
      })
    ).rejects.toThrow(/cancel/i);
  });
});

describe('inference capability', () => {
  it('detects CPU and does not silently invent ONNX availability', async () => {
    const snap = await detectInferenceRuntime({ probeOnnx: true });
    expect(snap.cpu).toBe(true);
    expect(snap.available).toContain('cpu');
    expect(snap.onnxRuntimeModuleAvailable).toBe(false);
    expect(snap.message.length).toBeGreaterThan(0);
  });
});

describe('review', () => {
  it('supports relabel merge split without mutating source mesh fingerprint', async () => {
    const provider = new ReferenceHeuristicProvider();
    const meshGeom = buildSyntheticDentalSurface('rev', 1, { gridResolution: 12 });
    const fp = meshGeom.fingerprint;
    const preprocess = await provider.preprocess(meshGeom, new AbortController().signal);
    const pred = await provider.infer({
      objectId: 'rev',
      sourceRevision: 0,
      geometryFingerprint: fp,
      mesh: meshGeom,
      preprocess,
      identificationThreshold: 0.5,
      signal: new AbortController().signal,
      report: () => undefined
    });
    const inst = pred.instances[0]!;
    const relabeled = relabelInstanceFdi(pred, inst.instanceId, 11);
    expect(relabeled.prediction.instances.find((i) => i.instanceId === inst.instanceId)?.identification.fdi).toBe(11);
    if (pred.instances.length >= 2) {
      const merged = mergeInstances(pred, pred.instances[0]!.instanceId, pred.instances[1]!.instanceId);
      expect(merged.prediction.instances.length).toBe(pred.instances.length - 1);
    }
    const half = inst.faceIndices.slice(0, Math.max(1, Math.floor(inst.faceIndices.length / 2)));
    if (half.length > 0 && half.length < inst.faceIndices.length) {
      const split = splitInstance(pred, inst.instanceId, half);
      expect(split.prediction.instances.length).toBe(pred.instances.length + 1);
    }
    expect(meshGeom.fingerprint).toBe(fp);
  });
});

describe('workflow', () => {
  it('runs enter → infer → accept with one document revision', async () => {
    const { host, clinical } = await boot();
    await prepareSegmentationReady(clinical);
    const seg = clinical.workspace.segmentation;
    const before = clinical.session.getPublicState().activeCase!.revision;
    expect(seg.enter().ok).toBe(true);
    expect(await seg.runInference()).toMatchObject({ ok: true });
    expect(seg.session.getState().phase).toBe('ready-for-review');
    expect(seg.session.getState().prediction?.instances.length).toBeGreaterThan(0);
    expect(clinical.session.getPublicState().activeCase!.revision).toBe(before);
    if ((seg.session.getState().prediction?.confidence.needsReviewCount ?? 0) > 0) {
      expect(seg.acknowledgeReview().ok).toBe(true);
    }
    expect(await seg.accept()).toMatchObject({ ok: true });
    expect(clinical.session.getPublicState().activeCase!.revision).toBeGreaterThan(before);
    expect(clinical.session.getPublicState().activeCase!.objects[0]!.segmentationMeta?.providerId).toBe(
      'reference-heuristic'
    );
    expect(seg.history.canUndo()).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('reject leaves document unchanged', async () => {
    const { host, clinical } = await boot();
    await prepareSegmentationReady(clinical);
    const before = clinical.session.getPublicState().activeCase!.revision;
    expect(clinical.workspace.segmentation.enter().ok).toBe(true);
    expect(await clinical.workspace.segmentation.runInference()).toMatchObject({ ok: true });
    expect(clinical.workspace.segmentation.reject().ok).toBe(true);
    expect(clinical.session.getPublicState().activeCase!.revision).toBe(before);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('blocks enter until ready-for-segmentation', async () => {
    const { host, clinical } = await boot();
    seed(clinical, [mesh('jaw')]);
    expect(clinical.workspace.segmentation.enter().ok).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('confidence calibration', () => {
  it('tracks reliability bins', () => {
    const tracker = new ConfidenceCalibrationTracker();
    tracker.record(0.9, true);
    tracker.record(0.2, false);
    tracker.record(0.7, true);
    expect(tracker.snapshot().samples).toBe(3);
    expect(tracker.calibrationError()).toBeGreaterThanOrEqual(0);
  });
});

describe('benchmark smoke', () => {
  it('runs small/medium/large without CI timing gates', async () => {
    const rows = await runSegmentationBenchmarkSmoke();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.success)).toBe(true);
    expect(rows.every((r) => r.model === 'clinical-reference-seg')).toBe(true);
  });

  it('builds model comparison table for decision evidence', async () => {
    const table = await buildSegmentationModelComparison();
    expect(table.some((r) => r.selectedDefault && r.model.includes('reference-heuristic'))).toBe(
      true
    );
    expect(table.every((r) => typeof r.license === 'string' && r.license.length > 0)).toBe(true);
  });
});

describe('architecture', () => {
  it('keeps ML/tensors out of clinical segmentation React/UI modules', () => {
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) out.push(...walk(p));
        else if (name.name.endsWith('.ts') || name.name.endsWith('.tsx')) out.push(p);
      }
      return out;
    };
    for (const file of walk(segRoot)) {
      if (file.includes(`${join('provider', 'adapters')}`)) continue;
      if (file.includes('ReferenceHeuristicProvider')) continue;
      if (file.includes('InstanceSeparation') || file.includes('BoundaryRefinement')) continue;
      if (file.includes('ToothIdentification') || file.includes('SegmentationPreprocess')) continue;
      if (file.includes('LargeMeshSampling')) continue;
      if (file.includes('SegmentationBenchmark')) continue;
      const src = readFileSync(file, 'utf8');
      expect(src.includes('torch') || src.includes('onnxruntime') || src.includes('tensorflow')).toBe(
        false
      );
    }
  });
});

describe('smoke', () => {
  it('boots with segmentation commands and handler', async () => {
    const app = new ClinicalApplication();
    const started = app.start({ forceMockViewportBackend: true, clock: { now: () => 91 } });
    expect(started.host.commands.get('clinical.tool.segmentation')?.enabled).toBe(true);
    expect(started.workspace.segmentation).toBeDefined();
    await app.shutdown();
  });
});
