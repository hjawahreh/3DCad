import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { ClinicalPreparationWorkflow } from '../../src/clinical/preparation/ClinicalPreparationWorkflow.js';
import { ClinicalPreparationLifecycle } from '../../src/clinical/preparation/ClinicalPreparationLifecycle.js';
import { ClinicalPreparationValidator } from '../../src/clinical/preparation/ClinicalPreparationValidator.js';
import { ClinicalPreparationPipeline } from '../../src/clinical/preparation/ClinicalPreparationPipeline.js';
import {
  ClinicalPreparationDiagnostics,
  ClinicalPreparationMetrics
} from '../../src/clinical/preparation/ClinicalPreparationObservability.js';
import { PREPARATION_STAGE_ORDER, nextStage } from '../../src/clinical/preparation/ClinicalPreparationStage.js';

const prepRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src/clinical/preparation');

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 15000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'Prep Case' }).ok).toBe(true);
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
    vertexCount: 50,
    faceCount: 100,
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
  expect(clinical.session.applyDocument(withClinicalObjects(doc, objects, 15001), true).ok).toBe(
    true
  );
};

const prepareCase = async (clinical: ReturnType<ClinicalBootstrap['bootstrap']>) => {
  seed(clinical, [mesh('jaw', 'Jaw')]);
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.accept().ok).toBe(true);
  clinical.workspace.preparation.notifyOrientationComplete();
};

describe('workflow', () => {
  it('advances phases and supports cancel', () => {
    const wf = new ClinicalPreparationWorkflow();
    expect(wf.transition('case-ready')).toBe(true);
    expect(wf.transition('orientation-validation')).toBe(true);
    expect(wf.transition('preparation-ready')).toBe(true);
    expect(wf.cancel()).toBe(true);
    expect(wf.getPhase()).toBe('cancelled');
    expect(wf.transition('idle')).toBe(true);
  });

  it('runs start → activate → advance → orchestrate → complete', async () => {
    const { host, clinical } = await boot();
    await prepareCase(clinical);
    const prep = clinical.workspace.preparation;
    expect(prep.start().ok).toBe(true);
    expect(prep.hasSession()).toBe(true);
    expect(prep.activateSession().ok).toBe(true);
    expect(prep.isActive()).toBe(true);
    for (let i = 0; i < PREPARATION_STAGE_ORDER.length - 1; i += 1) {
      expect(prep.advanceStage().ok).toBe(true);
    }
    expect(prep.session.getState().currentStage).toBe('preparation-complete');
    expect(prep.selectTool('trim').ok).toBe(true);
    expect(prep.activateTool('trim').ok).toBe(true);
    expect(prep.complete().ok).toBe(true);
    expect(prep.isReadyForGeometry()).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('stages', () => {
  it('orders stages immutably', () => {
    expect(PREPARATION_STAGE_ORDER[0]).toBe('orientation-complete');
    expect(nextStage('ready-for-movement')).toBe('preparation-complete');
    expect(nextStage('preparation-complete')).toBeUndefined();
  });
});

describe('validation', () => {
  it('produces immutable validation reports', async () => {
    const { host, clinical } = await boot();
    await prepareCase(clinical);
    const validator = new ClinicalPreparationValidator();
    const report = validator.validate({
      session: clinical.session,
      orientation: clinical.workspace.orientation,
      viewport: clinical.workspace.viewport,
      orientationValidated: true,
      requireSavedCase: false,
      now: 15002
    });
    expect(report.passed).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.checks)).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('fails when orientation is incomplete', async () => {
    const { host, clinical } = await boot();
    seed(clinical, [mesh('m1', 'Model')]);
    const validator = new ClinicalPreparationValidator();
    const report = validator.validate({
      session: clinical.session,
      orientation: clinical.workspace.orientation,
      viewport: clinical.workspace.viewport,
      orientationValidated: false,
      requireSavedCase: false,
      now: 15003
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'orientation-completed')?.passed).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('session', () => {
  it('supports create activate suspend resume cancel complete', () => {
    const lifecycle = new ClinicalPreparationLifecycle();
    expect(lifecycle.transition('created')).toBe(true);
    expect(lifecycle.transition('active')).toBe(true);
    expect(lifecycle.transition('suspended')).toBe(true);
    expect(lifecycle.transition('active')).toBe(true);
    expect(lifecycle.transition('completed')).toBe(true);
    expect(lifecycle.getPhase()).toBe('completed');
  });

  it('allows exactly one active preparation session', async () => {
    const { host, clinical } = await boot();
    await prepareCase(clinical);
    const prep = clinical.workspace.preparation;
    expect(prep.start().ok).toBe(true);
    expect(prep.start().ok).toBe(false);
    prep.cancel();
    expect(prep.start().ok).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('pipeline', () => {
  it('registers orchestration tools without geometry', () => {
    const pipeline = new ClinicalPreparationPipeline();
    expect(pipeline.list().length).toBe(7);
    expect(pipeline.isCompatible('ready-for-trim', 'trim')).toBe(true);
    expect(pipeline.isCompatible('orientation-complete', 'trim')).toBe(false);
    expect(pipeline.isCompatible('orientation-complete', 'analyze')).toBe(true);
  });
});

describe('diagnostics', () => {
  it('records sessions stages validation and metrics', () => {
    const diag = new ClinicalPreparationDiagnostics();
    const metrics = new ClinicalPreparationMetrics();
    diag.recordSessionStart();
    diag.recordStageTransition('ready-for-trim');
    diag.recordValidationFailure('test');
    diag.recordToolActivation('trim');
    diag.recordWorkflowComplete(200);
    metrics.recordPreparationComplete(200);
    metrics.recordValidationSuccess();
    metrics.recordStageCompletion('orientation-complete');
    expect(diag.snapshot().sessions).toBe(1);
    expect(diag.snapshot().toolActivations).toBe(1);
    expect(metrics.snapshot().preparationCount).toBe(1);
  });
});

describe('architecture', () => {
  it('does not implement geometry or import THREE', () => {
    const files = readdirSync(prepRoot).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const src = readFileSync(join(prepRoot, file), 'utf8');
      expect(
        src.includes('THREE.') ||
          src.includes('trimMesh') ||
          src.includes('segmentMesh') ||
          src.includes('OperationRuntime')
      ).toBe(false);
    }
  });
});

describe('smoke', () => {
  it('boots with preparation commands registered', async () => {
    const app = new ClinicalApplication();
    const started = app.start({ forceMockViewportBackend: true, clock: { now: () => 16 } });
    expect(started.host.commands.get('clinical.preparation.start')?.enabled).toBe(true);
    expect(started.workspace.preparation).toBeDefined();
    await app.shutdown();
  });
});
