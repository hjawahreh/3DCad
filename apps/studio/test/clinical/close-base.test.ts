import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kernelFailure } from '@cad-studio/kernel-bridge';
import { asWorkflowStepId } from '@cad-studio/tool-runtime';
import { ClinicalApplication } from '../../src/clinical/ClinicalApplication.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { ClinicalCloseBaseWorkflow } from '../../src/clinical/close-base/ClinicalCloseBaseWorkflow.js';
import { ClinicalCloseBaseLifecycle } from '../../src/clinical/close-base/ClinicalCloseBaseLifecycle.js';
import { ClinicalCloseBaseValidation } from '../../src/clinical/close-base/ClinicalCloseBaseValidation.js';
import { ClinicalCloseBaseHistory } from '../../src/clinical/close-base/ClinicalCloseBaseHistory.js';
import {
  ClinicalCloseBaseDiagnostics,
  ClinicalCloseBaseMetrics
} from '../../src/clinical/close-base/ClinicalCloseBaseObservability.js';
import {
  CLOSE_BASE_STRATEGIES,
  getCloseBaseStrategy
} from '../../src/clinical/close-base/ClinicalCloseBaseStrategy.js';
import {
  DEFAULT_CLOSE_BASE_PARAMETERS,
  sanitizeCloseBaseParameters
} from '../../src/clinical/close-base/ClinicalCloseBaseParameters.js';

const closeBaseRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src/clinical/close-base');

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 21000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'Close Base Case' }).ok).toBe(true);
  return { host, clinical };
};

const mesh = (id: string, name: string): ClinicalMeshDescriptor =>
  Object.freeze({
    id: asClinicalObjectId(id),
    displayName: name,
    sourceFile: `${name}.stl`,
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
  const doc = clinical.session.getPublicState().activeCase;
  expect(doc).toBeDefined();
  if (doc === undefined) return;
  expect(clinical.session.applyDocument(withClinicalObjects(doc, objects, 21001), true).ok).toBe(
    true
  );
};

const prepareCloseBaseReady = async (clinical: ReturnType<ClinicalBootstrap['bootstrap']>) => {
  seed(clinical, [mesh('jaw', 'Jaw')]);
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.accept().ok).toBe(true);
  clinical.workspace.preparation.notifyOrientationComplete();
  expect(clinical.workspace.preparation.start().ok).toBe(true);
  expect(clinical.workspace.preparation.activateSession().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
  expect(clinical.workspace.preparation.session.getState().currentStage).toBe(
    'ready-for-close-base'
  );
};

describe('workflow', () => {
  it('advances phases and supports cancel', () => {
    const wf = new ClinicalCloseBaseWorkflow();
    expect(wf.transition('activating')).toBe(true);
    expect(wf.transition('validating-case')).toBe(true);
    expect(wf.transition('selecting-strategy')).toBe(true);
    expect(wf.transition('configuring')).toBe(true);
    expect(wf.transition('previewing')).toBe(true);
    expect(wf.cancel()).toBe(true);
    expect(wf.getPhase()).toBe('cancelled');
  });

  it('runs enter → preview → accept end-to-end', async () => {
    const { host, clinical } = await boot();
    await prepareCloseBaseReady(clinical);
    const closeBase = clinical.workspace.closeBase;
    expect(closeBase.enter().ok).toBe(true);
    expect(closeBase.isActive()).toBe(true);
    expect(closeBase.setParameters({ height: 3 }).ok).toBe(true);
    expect(await closeBase.accept()).toMatchObject({ ok: true });
    expect(closeBase.isActive()).toBe(false);
    expect(closeBase.history.canUndo()).toBe(true);
    expect(clinical.session.getPublicState().dirty).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('lifecycle', () => {
  it('allows created → active → previewing → committing → completed', () => {
    const life = new ClinicalCloseBaseLifecycle();
    expect(life.transition('created')).toBe(true);
    expect(life.transition('active')).toBe(true);
    expect(life.transition('previewing')).toBe(true);
    expect(life.transition('committing')).toBe(true);
    expect(life.transition('completed')).toBe(true);
  });
});

describe('parameters', () => {
  it('clamps values and does not mutate document', async () => {
    const { host, clinical } = await boot();
    await prepareCloseBaseReady(clinical);
    const closeBase = clinical.workspace.closeBase;
    expect(closeBase.enter().ok).toBe(true);
    const before = clinical.session.getPublicState().activeCase!.revision;
    expect(closeBase.setParameters({ height: 99, thickness: 0.1 }).ok).toBe(true);
    const params = closeBase.session.getState().parameters;
    expect(params.height).toBe(20);
    expect(params.thickness).toBe(0.5);
    expect(clinical.session.getPublicState().activeCase!.revision).toBe(before);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('sanitizes unknown strategy to plane', () => {
    const next = sanitizeCloseBaseParameters({}, DEFAULT_CLOSE_BASE_PARAMETERS);
    expect(next.strategy).toBe('plane');
  });
});

describe('strategy', () => {
  it('maps plane and surface to existing Geometry Services contracts', () => {
    expect(CLOSE_BASE_STRATEGIES.length).toBeGreaterThanOrEqual(2);
    expect(getCloseBaseStrategy('plane')).toMatchObject({
      family: 'offset',
      geometryOperation: 'uniform'
    });
    expect(getCloseBaseStrategy('surface')).toMatchObject({
      family: 'repair',
      geometryOperation: 'fill-holes'
    });
    expect(getCloseBaseStrategy('offset')).toMatchObject({
      family: 'offset',
      geometryOperation: 'uniform'
    });
  });
});

describe('validation', () => {
  it('produces immutable reports and blocks invalid height/thickness', async () => {
    const { host, clinical } = await boot();
    await prepareCloseBaseReady(clinical);
    expect(clinical.workspace.closeBase.enter().ok).toBe(true);
    const validator = new ClinicalCloseBaseValidation();
    const report = validator.validate({
      session: clinical.session,
      preparation: clinical.workspace.preparation,
      parameters: { ...DEFAULT_CLOSE_BASE_PARAMETERS, height: 1, thickness: 2 },
      targetObjectId: asClinicalObjectId('jaw'),
      kernelAvailable: true,
      operationAvailable: true,
      kernelFingerprint: undefined,
      requireCommitEligibility: false,
      now: 21002
    });
    expect(report.passed).toBe(false);
    expect(Object.isFrozen(report)).toBe(true);
    expect(report.checks.find((c) => c.id === 'valid-parameters')?.passed).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('preview', () => {
  it('does not mutate document while previewing', async () => {
    const { host, clinical } = await boot();
    await prepareCloseBaseReady(clinical);
    const before = clinical.session.getPublicState().activeCase!.revision;
    expect(clinical.workspace.closeBase.enter().ok).toBe(true);
    expect(clinical.workspace.closeBase.session.getState().previewActive).toBe(true);
    expect(clinical.workspace.closeBase.setStrategy('surface').ok).toBe(true);
    expect(clinical.session.getPublicState().activeCase!.revision).toBe(before);
    expect(clinical.workspace.closeBase.history.canUndo()).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('operation runtime integration', () => {
  it('routes close-base through Operation Runtime to kernel bridge', async () => {
    const { host, clinical } = await boot();
    await prepareCloseBaseReady(clinical);
    const closeBase = clinical.workspace.closeBase;
    expect(closeBase.enter().ok).toBe(true);
    expect(await closeBase.submit()).toMatchObject({ ok: true });
    expect(host.runtimes.kernel.calls.length).toBeGreaterThan(0);
    expect(host.runtimes.tools.getActive()?.snapshot().phase).toBe('ready-to-commit');
    expect(host.runtimes.tools.getActive()?.snapshot().kind).toBe('close-base');
    closeBase.cancel();
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('geometry services integration', () => {
  it('executes offset.uniform and repair.fill-holes', async () => {
    const { host, clinical } = await boot();
    const signal = new AbortController().signal;
    const offset = await host.runtimes.geometry.execute(
      { family: 'offset', operation: 'uniform', inputRevision: 1, payload: { height: 2 } },
      signal
    );
    expect(offset.ok).toBe(true);
    if (offset.ok) {
      expect(offset.value.kernel.fingerprint).toMatch(/^geo:/);
    }
    const repair = await host.runtimes.geometry.execute(
      { family: 'repair', operation: 'fill-holes', inputRevision: 1, payload: {} },
      signal
    );
    expect(repair.ok).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('commit', () => {
  it('marks case dirty and updates mesh descriptors after token', async () => {
    const { host, clinical } = await boot();
    await prepareCloseBaseReady(clinical);
    const closeBase = clinical.workspace.closeBase;
    const faces = clinical.session.getPublicState().activeCase!.objects[0]!.faceCount!;
    expect(closeBase.enter().ok).toBe(true);
    expect(await closeBase.accept()).toMatchObject({ ok: true });
    expect(clinical.session.getPublicState().activeCase!.objects[0]!.faceCount!).toBeGreaterThan(
      faces
    );
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('history', () => {
  it('stores close-base operations only after commit', () => {
    const history = new ClinicalCloseBaseHistory();
    const previous = { objects: [], dirty: false } as unknown as Parameters<
      ClinicalCloseBaseHistory['push']
    >[0]['previous'];
    const next = { objects: [], dirty: true } as unknown as Parameters<
      ClinicalCloseBaseHistory['push']
    >[0]['next'];
    history.push({
      label: 'Close Base (plane)',
      objectId: 'jaw',
      fingerprint: 'mock:offset:uniform:1',
      strategy: 'plane',
      previous,
      next,
      createdAt: 1
    });
    expect(history.canUndo()).toBe(true);
  });
});

describe('undo/redo', () => {
  it('restores document via history', async () => {
    const { host, clinical } = await boot();
    await prepareCloseBaseReady(clinical);
    const closeBase = clinical.workspace.closeBase;
    const originalFaces = clinical.session.getPublicState().activeCase!.objects[0]!.faceCount!;
    expect(closeBase.enter().ok).toBe(true);
    expect(await closeBase.accept()).toMatchObject({ ok: true });
    expect(closeBase.undo().ok).toBe(true);
    expect(clinical.session.getPublicState().activeCase!.objects[0]!.faceCount).toBe(originalFaces);
    expect(closeBase.redo().ok).toBe(true);
    expect(clinical.session.getPublicState().activeCase!.objects[0]!.faceCount!).toBeGreaterThan(
      originalFaces
    );
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('cancellation', () => {
  it('cancels before commit without document change', async () => {
    const { host, clinical } = await boot();
    await prepareCloseBaseReady(clinical);
    const before = clinical.session.getPublicState().activeCase!.revision;
    expect(clinical.workspace.closeBase.enter().ok).toBe(true);
    expect(clinical.workspace.closeBase.cancel().ok).toBe(true);
    expect(clinical.session.getPublicState().activeCase!.revision).toBe(before);
    expect(clinical.workspace.closeBase.history.canUndo()).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('failure/no-mutation', () => {
  it('failed kernel yields no token, command, revision, or workflow advance', async () => {
    const { host, clinical } = await boot();
    await prepareCloseBaseReady(clinical);
    const closeBase = clinical.workspace.closeBase;
    const before = clinical.session.getPublicState().activeCase!;
    expect(closeBase.enter().ok).toBe(true);
    host.runtimes.kernel.failNext = kernelFailure('unexpected', 'generator failed');
    const result = await closeBase.accept();
    expect(result.ok).toBe(false);
    expect(clinical.session.getPublicState().activeCase!.revision).toBe(before.revision);
    expect(closeBase.history.canUndo()).toBe(false);
    expect(
      host.runtimes.tools.workflowGate.canAdvance(
        asWorkflowStepId('ready-for-close-base'),
        undefined
      ).ok
    ).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('preparation gate', () => {
  it('blocks Close Base until ready-for-close-base', async () => {
    const { host, clinical } = await boot();
    seed(clinical, [mesh('jaw', 'Jaw')]);
    expect(clinical.workspace.closeBase.getToolStatus()).toBe('not-ready');
    expect(clinical.workspace.closeBase.enter().ok).toBe(false);
    await prepareCloseBaseReady(clinical);
    expect(clinical.workspace.closeBase.getToolStatus()).toBe('ready');
    expect(clinical.workspace.closeBase.enter().ok).toBe(true);
    expect(clinical.workspace.closeBase.getToolStatus()).toBe('previewing');
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('diagnostics', () => {
  it('records sessions commits and metrics', () => {
    const diag = new ClinicalCloseBaseDiagnostics();
    const metrics = new ClinicalCloseBaseMetrics();
    diag.recordSessionStart('plane');
    diag.recordCommit({ durationMs: 180, kernelMs: 40, previewMs: 90, strategy: 'plane' });
    metrics.recordStart('plane');
    metrics.recordSuccess(180, 40, 90);
    metrics.recordParameterChange('surface');
    expect(diag.snapshot().commits).toBe(1);
    expect(metrics.snapshot().successful).toBe(1);
    expect(metrics.snapshot().parameterChanges).toBe(1);
  });
});

describe('architecture', () => {
  it('does not call KernelBridge directly or implement mesh algorithms', () => {
    const files = readdirSync(closeBaseRoot).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const file of files) {
      const src = readFileSync(join(closeBaseRoot, file), 'utf8');
      expect(src.includes('MockKernelBridge') || src.includes('.invoke(')).toBe(false);
      expect(src.includes('THREE.') || src.includes('trimMesh') || src.includes('fillHolesMesh')).toBe(
        false
      );
    }
  });
});

describe('smoke', () => {
  it('boots with close-base commands and handler registered', async () => {
    const app = new ClinicalApplication();
    const started = app.start({ forceMockViewportBackend: true, clock: { now: () => 22 } });
    expect(started.host.commands.get('clinical.tool.closeBase')?.enabled).toBe(true);
    expect(started.host.commands.get('clinical.closeBase.strategy.plane')?.enabled).toBe(true);
    expect(started.workspace.closeBase).toBeDefined();
    await app.shutdown();
  });
});
