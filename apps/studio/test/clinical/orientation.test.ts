import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDENTITY_MAT4 } from '@cad-studio/scene';
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
import {
  applyRotationDelta,
  isIdentityTransform,
  multiplyMat4,
  rotateXMat4,
  rotateYMat4,
  snapToWorldAxes
} from '../../src/clinical/orientation/ClinicalTransformMath.js';
import { ClinicalOrientationWorkflow } from '../../src/clinical/orientation/ClinicalOrientationWorkflow.js';
import { ClinicalOrientationGizmo } from '../../src/clinical/orientation/ClinicalOrientationGizmo.js';
import {
  ClinicalOrientationDiagnostics,
  ClinicalOrientationMetrics
} from '../../src/clinical/orientation/ClinicalOrientationObservability.js';
import { ClinicalOrientationHistory } from '../../src/clinical/orientation/ClinicalOrientationHistory.js';

const orientRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src/clinical/orientation');

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 12000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'Orient Case' }).ok).toBe(true);
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
  expect(clinical.session.applyDocument(withClinicalObjects(doc, objects, 12001), true).ok).toBe(
    true
  );
};

describe('workflow', () => {
  it('advances phases and supports cancel', () => {
    const wf = new ClinicalOrientationWorkflow();
    expect(wf.transition('entering')).toBe(true);
    expect(wf.transition('active')).toBe(true);
    expect(wf.transition('previewing')).toBe(true);
    expect(wf.cancel()).toBe(true);
    expect(wf.getPhase()).toBe('cancelled');
    expect(wf.transition('idle')).toBe(true);
  });

  it('runs enter → rotate → accept end-to-end', async () => {
    const { host, clinical } = await boot();
    seed(clinical, [mesh('jaw', 'Jaw')]);
    expect(clinical.workspace.orientation.enter().ok).toBe(true);
    expect(clinical.workspace.orientation.isActive()).toBe(true);
    expect(clinical.workspace.orientation.rotateBy(15, 'y').ok).toBe(true);
    expect(clinical.workspace.orientation.session.getState().dirtyPreview).toBe(true);
    expect(clinical.workspace.orientation.accept().ok).toBe(true);
    expect(clinical.workspace.orientation.isActive()).toBe(false);
    const obj = clinical.session.getPublicState().activeCase?.objects[0];
    expect(obj).toBeDefined();
    expect(isIdentityTransform(obj!.transform)).toBe(false);
    expect(clinical.session.getPublicState().dirty).toBe(true);
    expect(clinical.workspace.orientation.history.canUndo()).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('transform', () => {
  it('composes rotations without mutating identity constant', () => {
    const a = rotateXMat4(90);
    const b = rotateYMat4(45);
    const c = multiplyMat4(a, b);
    expect(c.elements).not.toEqual(IDENTITY_MAT4.elements);
    expect(isIdentityTransform(IDENTITY_MAT4)).toBe(true);
    const snapped = snapToWorldAxes(applyRotationDelta(IDENTITY_MAT4, rotateYMat4(88)));
    expect(snapped.elements.length).toBe(16);
  });
});

describe('preview', () => {
  it('does not mutate document until accept', async () => {
    const { host, clinical } = await boot();
    seed(clinical, [mesh('m1', 'Model')]);
    const before = clinical.session.getPublicState().activeCase!.objects[0]!.transform;
    expect(clinical.workspace.orientation.enter().ok).toBe(true);
    expect(clinical.workspace.orientation.rotateBy(30, 'x').ok).toBe(true);
    const during = clinical.session.getPublicState().activeCase!.objects[0]!.transform;
    expect(during.elements).toEqual(before.elements);
    expect(clinical.workspace.orientation.cancel().ok).toBe(true);
    const after = clinical.session.getPublicState().activeCase!.objects[0]!.transform;
    expect(after.elements).toEqual(before.elements);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('commit', () => {
  it('writes transform into clinical document on accept', async () => {
    const { host, clinical } = await boot();
    seed(clinical, [mesh('m2', 'Model')]);
    expect(clinical.workspace.orientation.enter().ok).toBe(true);
    expect(clinical.workspace.orientation.rotateBy(10, 'z').ok).toBe(true);
    const preview = clinical.workspace.orientation.session.getState().preview;
    expect(clinical.workspace.orientation.accept().ok).toBe(true);
    const committed = clinical.session.getPublicState().activeCase!.objects[0]!.transform;
    expect(committed.elements).toEqual(preview.elements);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('history', () => {
  it('stores transform operations only', () => {
    const history = new ClinicalOrientationHistory();
    const previous = {
      objects: [],
      dirty: false
    } as unknown as Parameters<ClinicalOrientationHistory['push']>[0]['previous'];
    const next = {
      objects: [],
      dirty: true
    } as unknown as Parameters<ClinicalOrientationHistory['push']>[0]['next'];
    const entry = history.push({
      label: 'Orient model',
      objectId: 'o1',
      previous,
      next,
      createdAt: 1
    });
    expect(entry.kind).toBe('orientation-transform');
    expect(history.canUndo()).toBe(true);
  });
});

describe('undo/redo', () => {
  it('restores prior transform via history', async () => {
    const { host, clinical } = await boot();
    seed(clinical, [mesh('m3', 'Model')]);
    const original = clinical.session.getPublicState().activeCase!.objects[0]!.transform;
    expect(clinical.workspace.orientation.enter().ok).toBe(true);
    expect(clinical.workspace.orientation.rotateBy(20, 'y').ok).toBe(true);
    expect(clinical.workspace.orientation.accept().ok).toBe(true);
    expect(clinical.workspace.orientation.undo().ok).toBe(true);
    expect(
      clinical.session.getPublicState().activeCase!.objects[0]!.transform.elements
    ).toEqual(original.elements);
    expect(clinical.workspace.orientation.redo().ok).toBe(true);
    expect(
      isIdentityTransform(clinical.session.getPublicState().activeCase!.objects[0]!.transform)
    ).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('gizmo', () => {
  it('tracks drag handles and computes delta degrees', () => {
    const gizmo = new ClinicalOrientationGizmo();
    const drag = gizmo.beginDrag({ handle: 'y', pointerId: 1, x: 100, y: 100 });
    expect(drag.active).toBe(true);
    gizmo.moveDrag(140, 100);
    const moved = gizmo.getDrag()!;
    expect(gizmo.deltaDegrees(moved)).toBeCloseTo(14, 0);
    expect(gizmo.axisForHandle('x')).toBe('x');
    gizmo.endDrag();
    expect(gizmo.getDrag()).toBeUndefined();
  });
});

describe('diagnostics', () => {
  it('records sessions, accept, cancel, and metrics', () => {
    const diag = new ClinicalOrientationDiagnostics();
    const metrics = new ClinicalOrientationMetrics();
    diag.recordSessionStart();
    diag.recordAccepted(120);
    diag.recordCancelled();
    diag.recordUndoRedo('undo');
    metrics.recordOrientationComplete(120);
    metrics.recordReset();
    metrics.recordSnap();
    metrics.recordAxis('axis-y');
    expect(diag.snapshot().accepted).toBe(1);
    expect(diag.snapshot().cancelled).toBe(1);
    expect(metrics.snapshot().snapUsage).toBe(1);
    expect(metrics.snapshot().averageCompletionTimeMs).toBe(120);
  });
});

describe('architecture', () => {
  it('does not modify mesh topology or import THREE', () => {
    const files = readdirSync(orientRoot).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const src = readFileSync(join(orientRoot, file), 'utf8');
      expect(src.includes('THREE.') || src.includes('trimMesh') || src.includes('parseStl')).toBe(
        false
      );
    }
  });
});

describe('smoke', () => {
  it('boots with orientation commands registered', async () => {
    const app = new ClinicalApplication();
    const started = app.start({ forceMockViewportBackend: true, clock: { now: () => 13 } });
    expect(started.host.commands.get('clinical.tool.orient')?.enabled).toBe(true);
    expect(started.host.commands.get('clinical.orientation.accept')?.enabled).toBe(true);
    expect(started.workspace.orientation).toBeDefined();
    await app.shutdown();
  });
});
