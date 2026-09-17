/**
 * CLN-TRIM-002 — professional Trim V4 + viewport cleanup.
 */
import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../../src/application/composition-root.js';
import { screenDeltaToOrbitRadians } from '../../../src/application/camera-orbit-mapping.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../../src/clinical/import/ClinicalMeshDescriptor.js';
import { withClinicalObjects } from '../../../src/clinical/document/ClinicalDocument.js';
import {
  deriveTrimInteractionState,
  isBoundaryClinicallyValid,
  trimGuidedMessage
} from '../../../src/clinical/trim/ClinicalTrimInteractionState.js';
import { DEFAULT_TRIM_STATE } from '../../../src/clinical/trim/ClinicalTrimState.js';
import type { TrimBoundaryPoint } from '../../../src/clinical/trim/ClinicalTrimBoundaryMath.js';
import { DEFAULT_CLINICAL_DISPLAY_PREFERENCES } from '../../../src/clinical/display/ClinicalDisplayPreferences.js';
import { ClinicalDisplayPreferencesStore } from '../../../src/clinical/display/ClinicalDisplayPreferences.js';
import { CANONICAL_CLINICAL_ANTERIOR_FACE } from '../../../src/clinical/display/ClinicalViewCubeMath.js';

const point = (x: number, y: number, z = 0): TrimBoundaryPoint =>
  Object.freeze({ x, y, localX: x, localY: y, localZ: z });

const mesh = (id: string, name: string, arch: 'upper' | 'lower' = 'upper'): ClinicalMeshDescriptor =>
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
    archRole: arch
  });

const bootTrim = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 33000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'CLN-TRIM-002' }).ok).toBe(true);
  const doc = clinical.session.getPublicState().activeCase!;
  expect(
    clinical.session.applyDocument(
      withClinicalObjects(doc, [mesh('upper', 'Upper'), mesh('lower', 'Lower', 'lower')], 33001),
      true
    ).ok
  ).toBe(true);
  host.runtimes.kernel.registry.ensureSourceMesh('upper', { gridResolution: 8 });
  host.runtimes.kernel.registry.ensureSourceMesh('lower', { gridResolution: 8 });
  const { geometryWarmup } = await import('../../../src/geometry-kernel/context/GeometryWarmup.js');
  for (const id of ['upper', 'lower']) {
    const working =
      host.runtimes.kernel.registry.getByObjectId(id, 'working') ??
      host.runtimes.kernel.registry.getByObjectId(id, 'source');
    if (working !== undefined) {
      await geometryWarmup.warmMesh(working, { arch: id === 'upper' ? 'upper' : 'lower' });
    }
  }
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.accept().ok).toBe(true);
  clinical.workspace.preparation.notifyOrientationComplete();
  expect(clinical.workspace.preparation.start().ok).toBe(true);
  expect(clinical.workspace.preparation.activateSession().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
  expect(clinical.workspace.trim.enter().ok).toBe(true);
  return { host, clinical };
};

describe('CLN-TRIM-002 interaction states + guidance', () => {
  it('1–2 arms Freehand and Polyline', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('freehand').ok).toBe(true);
    expect(
      deriveTrimInteractionState({
        state: trim.session.getState(),
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('ARMED');
    expect(trimGuidedMessage('ARMED', 'freehand')).toMatch(/Draw around/i);
    expect(trim.setDrawMode('polyline').ok).toBe(true);
    expect(trim.session.getState().points).toHaveLength(0);
    expect(trimGuidedMessage('ARMED', 'polyline')).toMatch(/release to trim/i);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('4 — miss does not add point (no local coords)', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('polyline').ok).toBe(true);
    const before = trim.session.getState().points.length;
    expect(
      trim.addPoint(Object.freeze({ x: 10, y: 10 }) as TrimBoundaryPoint).ok
    ).toBe(true);
    expect(trim.session.getState().points.length).toBe(before);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('5–7 — point ordering, surface attachment, closure', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('polyline').ok).toBe(true);
    const pts = [point(0, 0, 0), point(10, 0, 1), point(10, 10, 2), point(0, 10, 1), point(5, 5, 0)];
    for (const p of pts) {
      expect(trim.addPoint(p).ok).toBe(true);
    }
    const stored = trim.session.getState().points;
    expect(stored).toHaveLength(5);
    for (let i = 0; i < 5; i += 1) {
      expect(stored[i]!.localX).toBe(pts[i]!.localX);
      expect(stored[i]!.localY).toBe(pts[i]!.localY);
      expect(stored[i]!.localZ).toBe(pts[i]!.localZ);
    }
    trim.session.closePoints();
    expect(trim.session.getState().closed).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('9–11 — Clear hard reset + redraw + tool switch', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('freehand').ok).toBe(true);
    for (let i = 0; i < 8; i += 1) expect(trim.addPoint(point(i, i, 0)).ok).toBe(true);
    expect(trim.clearBoundary().ok).toBe(true);
    expect(trim.session.getState().points).toHaveLength(0);
    expect(trim.session.getState().closed).toBe(false);
    expect(trim.controller.isPreviewReady()).toBe(false);
    expect(trim.controller.isPointerCaptured()).toBe(false);
    expect(trim.session.getState().drawMode).toBe('freehand');
    expect(trim.isActive()).toBe(true);
    expect(trim.addPoint(point(40, 40, 1)).ok).toBe(true);
    expect(trim.session.getState().points).toHaveLength(1);
    expect(trim.setDrawMode('polyline').ok).toBe(true);
    expect(trim.session.getState().points).toHaveLength(0);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('13–16 — Accept blocked without real preview', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('polyline').ok).toBe(true);
    for (const p of [point(0, 0), point(20, 0), point(20, 20), point(0, 20)]) {
      expect(trim.addPoint(p).ok).toBe(true);
    }
    trim.session.closePoints();
    expect(trim.controller.canAcceptTrim()).toBe(false);
    const accepted = await trim.accept();
    expect(accepted.ok).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('boundary valid requires real preview delta — not pointCount alone', () => {
    expect(
      isBoundaryClinicallyValid({
        closed: true,
        surfaceHitsOnly: true,
        connected: true,
        nonSelfIntersecting: true,
        validationPassed: true,
        regionSelected: false,
        previewExists: false,
        previewMeaningfulDelta: false,
        fingerprintChanged: false,
        previewQualityPassed: false
      })
    ).toBe(false);
  });
});

describe('CLN-TRIM-002 camera + axes', () => {
  it('19 — orbit direction (single authoritative mapping)', () => {
    const right = screenDeltaToOrbitRadians(20, 0);
    const up = screenDeltaToOrbitRadians(0, -20);
    expect(right.yaw).toBeLessThan(0);
    expect(up.pitch).toBeGreaterThan(0);
  });

  it('18 — canonical Anterior face', () => {
    expect(CANONICAL_CLINICAL_ANTERIOR_FACE).toBe('front');
  });

  it('20 — clinical axes off by default and not restored from stale prefs', () => {
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showAxes).toBe(false);
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showOrigin).toBe(false);
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showOrientationIndicator).toBe(false);
    const store = new ClinicalDisplayPreferencesStore({
      showAxes: true,
      showOrigin: true,
      showOrientationIndicator: true
    });
    // Explicit constructor initial still allows diagnostics override when requested.
    expect(store.get().showAxes).toBe(true);
    const clean = new ClinicalDisplayPreferencesStore();
    expect(clean.get().showAxes).toBe(false);
    expect(clean.get().showOrientationIndicator).toBe(false);
  });

  it('guided EMPTY message hides engine jargon', () => {
    const msg = trimGuidedMessage('EMPTY', 'idle');
    expect(msg.toLowerCase()).not.toMatch(/surfacepath|dijkstra|vtk|fingerprint/);
    expect(msg).toMatch(/Lasso or Curve/i);
  });

  it('IDLE alias maps to EMPTY for drawMode idle', () => {
    expect(
      deriveTrimInteractionState({
        state: { ...DEFAULT_TRIM_STATE, drawMode: 'idle' },
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('EMPTY');
  });
});
