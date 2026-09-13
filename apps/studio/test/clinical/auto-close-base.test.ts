/**
 * Auto Close Base estimator + pipeline tests (Phase 6).
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
import { createMesh, fingerprintMesh } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import {
  estimateAutoCloseBase,
  estimateBaseOrientation,
  estimateCloseBaseParameters,
  estimateCloseBaseStrategy,
  AUTO_CLOSE_BASE_ALGORITHM_VERSION,
  AUTO_CLOSE_BASE_SAFETY
} from '../../src/clinical/close-base/ClinicalAutoCloseBaseEstimator.js';

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 26000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'Auto Close Base' }).ok).toBe(true);
  return { host, clinical };
};

const meshDesc = (id: string, name: string, arch?: 'upper' | 'lower'): ClinicalMeshDescriptor =>
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
    ...(arch === undefined ? {} : { archRole: arch })
  });

const prepareReady = async (clinical: ReturnType<ClinicalBootstrap['bootstrap']>) => {
  const doc = clinical.session.getPublicState().activeCase!;
  clinical.session.applyDocument(
    withClinicalObjects(doc, [meshDesc('jaw', 'Jaw', 'upper')], 26001),
    true
  );
  clinical.workspace.orientation.enter();
  clinical.workspace.orientation.accept();
  clinical.workspace.preparation.notifyOrientationComplete();
  clinical.workspace.preparation.start();
  clinical.workspace.preparation.activateSession();
  clinical.workspace.preparation.advanceStage();
  clinical.workspace.preparation.advanceStage();
};

const openSurface = (id: string, n = 12) => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= n; y += 1) {
    for (let x = 0; x <= n; x += 1) {
      positions.push(x, y * 0.4, Math.sin(x * 0.3) * 0.2);
    }
  }
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const i = y * (n + 1) + x;
      indices.push(i, i + 1, i + n + 1);
      indices.push(i + 1, i + n + 2, i + n + 1);
    }
  }
  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return createMesh({
    id: 1,
    objectId: id,
    role: 'working',
    revision: 1,
    positions: pos,
    indices: idx,
    fingerprint: fingerprintMesh(pos, idx)
  });
};

describe('auto close-base estimator', () => {
  it('prefers xz for clinical Y-up spans', () => {
    expect(estimateBaseOrientation(40, 25, 35)).toBe('xz');
  });

  it('selects plane for typical open boundaries', () => {
    const m = openSurface('est');
    const estimate = estimateAutoCloseBase(m);
    expect(estimate.ok).toBe(true);
    expect(estimate.algorithmVersion).toBe(AUTO_CLOSE_BASE_ALGORITHM_VERSION);
    expect(estimate.parameters.height).toBeGreaterThanOrEqual(AUTO_CLOSE_BASE_SAFETY.heightMin);
    expect(estimate.parameters.height).toBeLessThanOrEqual(AUTO_CLOSE_BASE_SAFETY.heightMax);
    expect(estimate.parameters.thickness).toBeLessThanOrEqual(estimate.parameters.height);
  });

  it('rejects tiny / empty meshes for review', () => {
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const idx = new Uint32Array([0, 1, 2]);
    const tiny = createMesh({
      id: 2,
      objectId: 'tiny',
      role: 'working',
      revision: 1,
      positions: pos,
      indices: idx,
      fingerprint: fingerprintMesh(pos, idx)
    });
    const estimate = estimateAutoCloseBase(tiny);
    expect(estimate.ok).toBe(false);
    expect(estimate.needsReview).toBe(true);
    expect(estimate.message).toMatch(/needs review/i);
  });

  it('is deterministic for the same mesh', () => {
    const m = openSurface('det');
    const a = estimateAutoCloseBase(m);
    const b = estimateAutoCloseBase(m);
    expect(a.parameters).toEqual(b.parameters);
    expect(a.strategy).toBe(b.strategy);
    expect(a.timingMs).toBeGreaterThanOrEqual(0);
  });

  it('clamps estimated parameters within safety limits', () => {
    const analysis = {
      vertexCount: 1000,
      triangleCount: 2000,
      boundaryEdges: 80,
      components: 1,
      degenerateCount: 0,
      spanX: 80,
      spanY: 40,
      spanZ: 70,
      diagonal: 120,
      qualityOk: true,
      qualityCodes: [],
      qualityWarnings: []
    };
    const { strategy } = estimateCloseBaseStrategy(analysis);
    const params = estimateCloseBaseParameters(analysis, strategy, 'xz');
    expect(params.height).toBeLessThanOrEqual(AUTO_CLOSE_BASE_SAFETY.heightMax);
    expect(params.thickness).toBeLessThanOrEqual(AUTO_CLOSE_BASE_SAFETY.thicknessMax);
    expect(params.margin).toBeLessThanOrEqual(AUTO_CLOSE_BASE_SAFETY.offsetMax);
  });
});

describe('auto close-base pipeline', () => {
  it('auto-creates preview without committing', async () => {
    const { host, clinical } = await boot();
    await prepareReady(clinical);
    const closeBase = clinical.workspace.closeBase;
    const before = clinical.session.getPublicState().activeCase!.revision;
    expect(await closeBase.autoCloseBase()).toMatchObject({ ok: true });
    expect(closeBase.isActive()).toBe(true);
    expect(closeBase.session.getState().interactionMode).toBe('auto');
    expect(closeBase.session.getState().kernelFingerprint).toMatch(/^geo:/);
    expect(closeBase.session.getState().autoEstimate?.ok).toBe(true);
    expect(closeBase.history.canUndo()).toBe(false);
    // Preview may republish; accept is required to create history.
    expect(clinical.session.getPublicState().activeCase!.revision).toBeGreaterThanOrEqual(before);
    expect(await closeBase.accept()).toMatchObject({ ok: true });
    expect(closeBase.history.canUndo()).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('falls back to manual when estimate fails', async () => {
    const { host, clinical } = await boot();
    await prepareReady(clinical);
    const closeBase = clinical.workspace.closeBase;
    expect(closeBase.enter().ok).toBe(true);
    // Seed then replace working with a tiny invalid surface for this object.
    const registry = host.runtimes.kernel.registry;
    registry.ensureSourceMesh('jaw');
    const pos = new Float32Array([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0]);
    const idx = new Uint32Array([0, 1, 2]);
    const tiny = createMesh({
      id: registry.allocateHandle() as number,
      objectId: 'jaw',
      role: 'working',
      revision: 9,
      positions: pos,
      indices: idx,
      fingerprint: fingerprintMesh(pos, idx)
    });
    registry.commitWorking('jaw', tiny);
    const beforeRev = clinical.session.getPublicState().activeCase!.revision;
    const result = await closeBase.autoCloseBase();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toMatch(/needs review/i);
    expect(closeBase.isActive()).toBe(true);
    expect(closeBase.session.getState().interactionMode).toBe('manual');
    expect(closeBase.history.canUndo()).toBe(false);
    expect(clinical.session.getPublicState().activeCase!.revision).toBe(beforeRev);
    expect(closeBase.enterManualMode().ok).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('supports upper/lower auto independently', async () => {
    const { host, clinical } = await boot();
    const doc = clinical.session.getPublicState().activeCase!;
    clinical.session.applyDocument(
      withClinicalObjects(
        doc,
        [meshDesc('upper', 'Upper', 'upper'), meshDesc('lower', 'Lower', 'lower')],
        26002
      ),
      true
    );
    clinical.workspace.orientation.enter();
    clinical.workspace.orientation.accept();
    clinical.workspace.preparation.notifyOrientationComplete();
    clinical.workspace.preparation.start();
    clinical.workspace.preparation.activateSession();
    clinical.workspace.preparation.advanceStage();
    clinical.workspace.preparation.advanceStage();

    const closeBase = clinical.workspace.closeBase;
    expect(closeBase.enter(asClinicalObjectId('upper')).ok).toBe(true);
    expect(await closeBase.autoCloseBase()).toMatchObject({ ok: true });
    expect(closeBase.setActiveArch('lower').ok).toBe(true);
    expect(await closeBase.autoCloseBase()).toMatchObject({ ok: true });
    clinical.runtime.dispose();
    host.dispose();
  });
});
