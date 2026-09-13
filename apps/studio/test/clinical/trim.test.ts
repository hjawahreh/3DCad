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
import { ClinicalTrimWorkflow } from '../../src/clinical/trim/ClinicalTrimWorkflow.js';
import { ClinicalTrimValidation } from '../../src/clinical/trim/ClinicalTrimValidation.js';
import {
  closeBoundary,
  hasSelfIntersection,
  isClosedBoundary,
  MIN_BOUNDARY_POINTS,
  type TrimBoundaryPoint
} from '../../src/clinical/trim/ClinicalTrimBoundaryMath.js';
import { ClinicalTrimHistory } from '../../src/clinical/trim/ClinicalTrimHistory.js';
import {
  ClinicalTrimDiagnostics,
  ClinicalTrimMetrics
} from '../../src/clinical/trim/ClinicalTrimObservability.js';
import { PREPARATION_STAGE_ORDER } from '../../src/clinical/preparation/ClinicalPreparationStage.js';

const trimRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src/clinical/trim');

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 18000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'Trim Case' }).ok).toBe(true);
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
    transform: IDENTITY_CLINICAL_TRANSFORM,
    archRole: 'upper' as const
  });

const seed = (
  host: StudioCompositionRoot,
  clinical: ReturnType<ClinicalBootstrap['bootstrap']>,
  objects: readonly ClinicalMeshDescriptor[]
) => {
  const doc = clinical.session.getPublicState().activeCase;
  expect(doc).toBeDefined();
  if (doc === undefined) return;
  expect(clinical.session.applyDocument(withClinicalObjects(doc, objects, 18001), true).ok).toBe(
    true
  );
  const registry = host.runtimes.kernel.registry;
  for (const obj of objects) {
    registry.ensureSourceMesh(String(obj.id), { gridResolution: 24 });
  }
};

/** Screen + mesh-local loop around synthetic grid center (removable under KEEP_OUTSIDE). */
const surfaceLoop = (): readonly TrimBoundaryPoint[] =>
  Object.freeze([
    Object.freeze({
      x: 100,
      y: 100,
      localX: -8,
      localY: -8,
      localZ: 0,
      objectId: 'jaw'
    }),
    Object.freeze({
      x: 300,
      y: 100,
      localX: 8,
      localY: -8,
      localZ: 0,
      objectId: 'jaw'
    }),
    Object.freeze({
      x: 300,
      y: 280,
      localX: 8,
      localY: 8,
      localZ: 0,
      objectId: 'jaw'
    }),
    Object.freeze({
      x: 100,
      y: 280,
      localX: -8,
      localY: 8,
      localZ: 0,
      objectId: 'jaw'
    })
  ]);

const screenTriangle = Object.freeze([
  Object.freeze({ x: 100, y: 100 }),
  Object.freeze({ x: 300, y: 100 }),
  Object.freeze({ x: 200, y: 280 })
]);

const prepareTrimReady = async (
  host: StudioCompositionRoot,
  clinical: ReturnType<ClinicalBootstrap['bootstrap']>
) => {
  seed(host, clinical, [mesh('jaw', 'Jaw')]);
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.accept().ok).toBe(true);
  clinical.workspace.preparation.notifyOrientationComplete();
  expect(clinical.workspace.preparation.start().ok).toBe(true);
  expect(clinical.workspace.preparation.activateSession().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
  expect(clinical.workspace.preparation.session.getState().currentStage).toBe('ready-for-trim');
};

const drawClosedLoop = (trim: ReturnType<ClinicalBootstrap['bootstrap']>['workspace']['trim']) => {
  expect(trim.enter().ok).toBe(true);
  expect(trim.setDrawMode('polyline').ok).toBe(true);
  for (const p of surfaceLoop()) {
    expect(trim.addPoint(p).ok).toBe(true);
  }
  expect(trim.closeBoundary().ok).toBe(true);
  expect(trim.session.getState().closed).toBe(true);
};

describe('workflow', () => {
  it('advances phases and supports cancel', () => {
    const wf = new ClinicalTrimWorkflow();
    expect(wf.transition('activating')).toBe(true);
    expect(wf.transition('acquiring-pointer')).toBe(true);
    expect(wf.transition('drawing')).toBe(true);
    expect(wf.cancel()).toBe(true);
    expect(wf.getPhase()).toBe('cancelled');
  });

  it('runs enter → draw → accept end-to-end', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    const trim = clinical.workspace.trim;
    drawClosedLoop(trim);
    expect(await trim.accept()).toMatchObject({ ok: true });
    // GEO-001E multi-trim: stay active after accept.
    expect(trim.isActive()).toBe(true);
    expect(trim.history.canUndo()).toBe(true);
    expect(clinical.session.getPublicState().dirty).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('boundary', () => {
  it('detects closed boundaries and self-intersection', () => {
    expect(isClosedBoundary(screenTriangle)).toBe(false);
    const closed = closeBoundary(screenTriangle);
    expect(closed.length).toBeGreaterThanOrEqual(MIN_BOUNDARY_POINTS);
    expect(isClosedBoundary(closed)).toBe(true);
    expect(hasSelfIntersection(closed)).toBe(false);
  });

  it('accepts a normal closed convex polygon (P1→P2→P3→P4→P1)', () => {
    const quad = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 0, y: 30 }
    ];
    const closed = closeBoundary(quad);
    expect(isClosedBoundary(closed)).toBe(true);
    expect(hasSelfIntersection(closed)).toBe(false);
  });

  it('accepts a normal closed pentagon (operator 5-point case)', () => {
    const pent = [
      { x: 20, y: 0 },
      { x: 40, y: 15 },
      { x: 32, y: 40 },
      { x: 8, y: 40 },
      { x: 0, y: 15 }
    ];
    const closed = closeBoundary(pent);
    expect(isClosedBoundary(closed)).toBe(true);
    expect(hasSelfIntersection(closed)).toBe(false);
  });

  it('rejects a genuinely self-crossing bow-tie polygon', () => {
    const bow = [
      { x: 0, y: 0 },
      { x: 40, y: 40 },
      { x: 40, y: 0 },
      { x: 0, y: 40 }
    ];
    expect(hasSelfIntersection(closeBoundary(bow))).toBe(true);
  });
});

describe('validation', () => {
  it('produces immutable validation reports', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    const validation = new ClinicalTrimValidation();
    const report = validation.validate({
      session: clinical.session,
      preparation: clinical.workspace.preparation,
      points: surfaceLoop(),
      closed: true,
      targetObjectId: asClinicalObjectId('jaw'),
      kernelAvailable: true,
      now: 18002
    });
    expect(report.passed).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('reports actionable self-crossing message', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    const validation = new ClinicalTrimValidation();
    const bow = [
      { x: 0, y: 0 },
      { x: 40, y: 40 },
      { x: 40, y: 0 },
      { x: 0, y: 40 }
    ];
    const report = validation.validate({
      session: clinical.session,
      preparation: clinical.workspace.preparation,
      points: closeBoundary(bow),
      closed: true,
      targetObjectId: asClinicalObjectId('jaw'),
      kernelAvailable: true,
      now: 18003
    });
    expect(report.passed).toBe(false);
    expect(report.checks.some((c) => !c.passed && /self|cross/i.test(c.message))).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('preview', () => {
  it('does not mutate document while drawing', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    expect(clinical.workspace.trim.enter().ok).toBe(true);
    expect(clinical.workspace.trim.setDrawMode('polyline').ok).toBe(true);
    const before = clinical.session.getPublicState().activeCase!.objects[0]!.geometryFingerprint;
    const beforeFaces = clinical.session.getPublicState().activeCase!.objects[0]!.faceCount;
    expect(clinical.workspace.trim.addPoint(surfaceLoop()[0]!).ok).toBe(true);
    expect(clinical.workspace.trim.addPoint(surfaceLoop()[1]!).ok).toBe(true);
    const after = clinical.session.getPublicState().activeCase!.objects[0]!;
    expect(after.geometryFingerprint).toBe(before);
    expect(after.faceCount).toBe(beforeFaces);
    expect(clinical.workspace.trim.cancel().ok).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('multi-trim and arch switch', () => {
  it('keeps trim active after accept for a second cut', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    const trim = clinical.workspace.trim;
    drawClosedLoop(trim);
    const fpA = clinical.session.getPublicState().activeCase!.objects[0]!.geometryFingerprint;
    expect(await trim.accept()).toMatchObject({ ok: true });
    expect(trim.isActive()).toBe(true);
    expect(trim.session.getState().points).toHaveLength(0);
    const fpB = clinical.session.getPublicState().activeCase!.objects[0]!.geometryFingerprint;
    expect(fpB).not.toBe(fpA);
    expect(trim.setDrawMode('polyline').ok).toBe(true);
    // Re-arm drawing on current geometry (second accept covered by GEO-001E browser walkthrough).
    expect(trim.addPoint(surfaceLoop()[0]!).ok).toBe(true);
    expect(trim.session.getState().points.length).toBeGreaterThan(0);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('commit', () => {
  it('marks case dirty and updates mesh metadata', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    const trim = clinical.workspace.trim;
    drawClosedLoop(trim);
    expect(await trim.accept()).toMatchObject({ ok: true });
    const obj = clinical.session.getPublicState().activeCase!.objects[0]!;
    expect(obj.geometryFingerprint).toMatch(/^geo:/);
    expect(obj.vertexCount).toBeGreaterThan(0);
    expect(obj.faceCount).toBeGreaterThan(0);
    expect(obj.faceCount!).toBeLessThan(200 * 24);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('history', () => {
  it('stores trim operations only', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    const registry = host.runtimes.kernel.registry;
    const working = registry.getByObjectId('jaw', 'working') ?? registry.getByObjectId('jaw', 'source');
    expect(working).toBeDefined();
    const history = new ClinicalTrimHistory();
    const previous = clinical.session.getPublicState().activeCase!;
    const next = { ...previous, dirty: true } as typeof previous;
    history.push({
      label: 'Trim mesh',
      objectId: 'jaw',
      fingerprint: 'mock:boolean:subtract:1',
      previous,
      next,
      previousMesh: working!,
      nextMesh: working!,
      createdAt: 1
    });
    expect(history.canUndo()).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('undo/redo', () => {
  it('restores document via history', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    const trim = clinical.workspace.trim;
    const original = clinical.session.getPublicState().activeCase!.objects[0]!;
    const originalCount = original.vertexCount!;
    drawClosedLoop(trim);
    expect(await trim.accept()).toMatchObject({ ok: true });
    const trimmed = clinical.session.getPublicState().activeCase!.objects[0]!;
    expect(trimmed.geometryFingerprint).toMatch(/^geo:/);
    expect(trimmed.faceCount!).toBeLessThan(1152);
    expect(trim.undo().ok).toBe(true);
    expect(clinical.session.getPublicState().activeCase!.objects[0]!.vertexCount).toBe(
      originalCount
    );
    expect(trim.redo().ok).toBe(true);
    expect(clinical.session.getPublicState().activeCase!.objects[0]!.geometryFingerprint).toMatch(
      /^geo:/
    );
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('operation runtime integration', () => {
  it('routes trim through geometry services and kernel bridge', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    const trim = clinical.workspace.trim;
    drawClosedLoop(trim);
    expect(await trim.submit()).toMatchObject({ ok: true });
    expect(host.runtimes.kernel.calls.length).toBeGreaterThan(0);
    expect(host.runtimes.tools.getActive()?.snapshot().phase).toBe('ready-to-commit');
    trim.cancel();
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('geometry services integration', () => {
  it('executes boolean subtract for trim kernel request', async () => {
    const { host, clinical } = await boot();
    await prepareTrimReady(host, clinical);
    const result = await host.runtimes.geometry.execute(
      {
        family: 'boolean',
        operation: 'subtract',
        inputRevision: 1,
        payload: {
          targetObjectId: 'jaw',
          boundary: screenTriangle,
          loop3d: surfaceLoop().map((p) => ({
            x: p.localX!,
            y: p.localY!,
            z: p.localZ!
          })),
          keepMode: 'KEEP_OUTSIDE',
          algorithm: 'exact-edge-clip'
        }
      },
      new AbortController().signal
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kernel.fingerprint).toMatch(/^geo:/);
    }
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('diagnostics', () => {
  it('records sessions commits and metrics', () => {
    const diag = new ClinicalTrimDiagnostics();
    const metrics = new ClinicalTrimMetrics();
    diag.recordSessionStart();
    diag.recordCommit(200, 4, 50);
    metrics.recordTrimStart();
    metrics.recordAccepted(200, 4, 50);
    expect(diag.snapshot().commits).toBe(1);
    expect(metrics.snapshot().accepted).toBe(1);
  });
});

describe('architecture', () => {
  it('does not call KernelBridge directly from trim modules', () => {
    const files = readdirSync(trimRoot).filter(
      (f) => f.endsWith('.ts') && f !== 'GeometryServicesKernelPort.ts'
    );
    for (const file of files) {
      const src = readFileSync(join(trimRoot, file), 'utf8');
      expect(src.includes('MockKernelBridge') || src.includes('kernel.invoke')).toBe(false);
    }
  });
});

describe('smoke', () => {
  it('boots with trim commands and handler registered', async () => {
    const app = new ClinicalApplication();
    const started = app.start({ forceMockViewportBackend: true, clock: { now: () => 20 } });
    expect(started.host.commands.get('clinical.tool.trim')?.enabled).toBe(true);
    expect(started.workspace.trim).toBeDefined();
    expect(PREPARATION_STAGE_ORDER.includes('ready-for-trim')).toBe(true);
    await app.shutdown();
  });
});
