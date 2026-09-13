/**
 * PRE-CLN-012 — Clinical viewport & trim usability correction regressions.
 */

import { describe, expect, it } from 'vitest';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import {
  applyClinicalAnteriorPose,
  inferClinicalAxes
} from '../../src/clinical/display/ClinicalAnteriorCamera.js';
import {
  closeBoundary,
  hasSelfIntersection
} from '../../src/clinical/trim/ClinicalTrimBoundaryMath.js';

const host = () =>
  new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 1000 }
  });

const mesh = (
  id: string,
  name: string,
  archRole?: 'upper' | 'lower',
  visible = true
): ClinicalMeshDescriptor =>
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
    visible,
    selectable: true,
    hierarchyParentId: undefined,
    importerId: 'studio-passthrough',
    sourceEntityId: id,
    displayState: visible ? ('default' as const) : ('hidden' as const),
    transform: IDENTITY_CLINICAL_TRANSFORM,
    ...(archRole === undefined ? {} : { archRole })
  });

const bootCase = async () => {
  const h = host();
  const boot = new ClinicalBootstrap().bootstrap(h);
  await h.attachViewport({
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => null
  });
  expect(boot.session.newCase({ name: 'Demo', patientName: 'Patient' }).ok).toBe(true);
  const doc = boot.session.getPublicState().activeCase!;
  const upper = mesh('upper-arch', 'Upper Arch', 'upper');
  const lower = mesh('lower-arch', 'Lower Arch', 'lower');
  expect(
    boot.session.applyDocument(withClinicalObjects(doc, [upper, lower], 1001), true).ok
  ).toBe(true);
  return { h, boot, upper, lower };
};

const eyeDistance = (h: StudioCompositionRoot): number => {
  const snap = h.sessions.cameraSession!.getSnapshot();
  return Math.hypot(
    snap.eye.x - snap.target.x,
    snap.eye.y - snap.target.y,
    snap.eye.z - snap.target.z
  );
};

describe('pre-cln012 wheel zoom', () => {
  it('zooms in on wheel-up and out on wheel-down without reset', async () => {
    const { h, boot } = await bootCase();
    boot.workspace.viewport.presentClinicalAnteriorView();
    const baseline = eyeDistance(h);

    // Wheel up (deltaY < 0) → zoom in → smaller radius
    h.handleRawInput({
      kind: 'wheel',
      position: { x: 100, y: 100 },
      deltaX: 0,
      deltaY: -40,
      deltaZ: 0,
      deltaMode: 'pixel',
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      timestamp: 11
    });
    const afterIn = eyeDistance(h);
    expect(afterIn).toBeLessThan(baseline);

    // Wheel down (deltaY > 0) → zoom out → larger radius
    h.handleRawInput({
      kind: 'wheel',
      position: { x: 100, y: 100 },
      deltaX: 0,
      deltaY: 40,
      deltaZ: 0,
      deltaMode: 'pixel',
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      timestamp: 12
    });
    const afterOut = eyeDistance(h);
    expect(afterOut).toBeGreaterThan(afterIn);
    // Must not hard-reset to baseline (continuous zoom).
    expect(Math.abs(afterOut - baseline)).toBeLessThan(baseline * 0.5);

    boot.runtime.dispose();
    h.dispose();
  });

  it('zoom works after orientation / preparation / trim enter', async () => {
    const { h, boot } = await bootCase();
    boot.workspace.preparation.notifyOrientationComplete();
    expect(boot.workspace.preparation.confirmReadyForTrim().ok).toBe(true);

    const phases: Array<() => void> = [
      () => {
        boot.workspace.orientation.enter();
      },
      () => {
        boot.workspace.orientation.cancel();
        boot.workspace.preparation.start();
      },
      () => {
        h.sessions.selectionSession?.select('replace', ['upper-arch']);
        boot.workspace.trim.enter();
      }
    ];

    for (const enterPhase of phases) {
      enterPhase();
      const beforeOut = eyeDistance(h);
      h.handleRawInput({
        kind: 'wheel',
        position: { x: 50, y: 50 },
        deltaX: 0,
        deltaY: 80,
        deltaZ: 0,
        deltaMode: 'pixel',
        modifiers: { alt: false, ctrl: false, meta: false, shift: false },
        timestamp: Date.now()
      });
      const afterOut = eyeDistance(h);
      expect(afterOut).toBeGreaterThan(beforeOut);
      h.handleRawInput({
        kind: 'wheel',
        position: { x: 50, y: 50 },
        deltaX: 0,
        deltaY: -80,
        deltaZ: 0,
        deltaMode: 'pixel',
        modifiers: { alt: false, ctrl: false, meta: false, shift: false },
        timestamp: Date.now()
      });
      expect(eyeDistance(h)).toBeLessThan(afterOut);
    }

    boot.workspace.trim.cancel();
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('pre-cln012 anterior elevation', () => {
  it('applies elevated patient-facing anterior pose from AABB axes', async () => {
    const { h, boot } = await bootCase();
    const axes = inferClinicalAxes(DEFAULT_MESH_BOUNDS);
    expect(axes.superior).toBe('z');
    expect(boot.workspace.viewport.presentClinicalAnteriorView().ok).toBe(true);
    const cam = h.sessions.cameraSession!;
    const snap = cam.getSnapshot();
    const toEye = {
      x: snap.eye.x - snap.target.x,
      y: snap.eye.y - snap.target.y,
      z: snap.eye.z - snap.target.z
    };
    const len = Math.hypot(toEye.x, toEye.y, toEye.z);
    // PROD-002SC canonical clinical frame: Ant look ≈ elevated +Z, up = +Y.
    expect(toEye.z / len).toBeGreaterThan(0.75);
    expect(Math.abs(snap.up.y)).toBeGreaterThan(0.9);
    // Explicit AABB path remains available for pre-orient helpers.
    expect(
      applyClinicalAnteriorPose(cam, DEFAULT_MESH_BOUNDS, { preferClinicalFrame: false })
    ).toBe(true);
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('pre-cln012 trim arch isolation', () => {
  it('keeps BOTH visible on trim enter by default and restores on cancel', async () => {
    const { h, boot, upper, lower } = await bootCase();
    boot.workspace.preparation.notifyOrientationComplete();
    expect(boot.workspace.preparation.confirmReadyForTrim().ok).toBe(true);
    // Default arch context is BOTH — inactive arch stays visible; tool target is explicit.
    expect(boot.workspace.archContext.getMode()).toBe('both');
    h.sessions.selectionSession?.select('replace', [upper.id as string]);
    expect(boot.workspace.trim.enter().ok).toBe(true);

    const during = boot.session.getPublicState().activeCase!.objects;
    const upperObj = during.find((o) => o.id === upper.id)!;
    const lowerObj = during.find((o) => o.id === lower.id)!;
    expect(upperObj.visible).toBe(true);
    expect(lowerObj.visible).toBe(true);
    expect(boot.workspace.trim.session.getState().drawMode).toBe('idle');
    expect(boot.workspace.trim.session.getState().targetObjectId).toBe(upper.id);

    expect(boot.workspace.trim.cancel().ok).toBe(true);
    const after = boot.session.getPublicState().activeCase!.objects;
    expect(after.find((o) => o.id === upper.id)!.visible).toBe(true);
    expect(after.find((o) => o.id === lower.id)!.visible).toBe(true);

    boot.runtime.dispose();
    h.dispose();
  });

  it('isolates lower when arch mode is LOWER on trim enter', async () => {
    const { h, boot, upper, lower } = await bootCase();
    boot.workspace.preparation.notifyOrientationComplete();
    expect(boot.workspace.preparation.confirmReadyForTrim().ok).toBe(true);
    boot.workspace.archContext.setMode('lower');
    h.sessions.selectionSession?.select('replace', [lower.id as string]);
    expect(boot.workspace.trim.enter().ok).toBe(true);

    const during = boot.session.getPublicState().activeCase!.objects;
    expect(during.find((o) => o.id === lower.id)!.visible).toBe(true);
    expect(during.find((o) => o.id === upper.id)!.visible).toBe(false);
    expect(boot.workspace.trim.session.getState().targetObjectId).toBe(lower.id);

    boot.workspace.trim.cancel();
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('pre-cln012 polygon validation', () => {
  it('valid closed polygons pass; crossing polygons fail', () => {
    const valid = closeBoundary([
      { x: 0, y: 0 },
      { x: 50, y: 5 },
      { x: 45, y: 40 },
      { x: 10, y: 45 },
      { x: -5, y: 20 }
    ]);
    expect(hasSelfIntersection(valid)).toBe(false);

    const crossing = closeBoundary([
      { x: 0, y: 0 },
      { x: 30, y: 30 },
      { x: 30, y: 0 },
      { x: 0, y: 30 }
    ]);
    expect(hasSelfIntersection(crossing)).toBe(true);
  });
});
