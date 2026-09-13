/**
 * Pre-CLN-011 clinical workflow correction — regression suite.
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
import { buildClinicalWorkflowPresentation } from '../../src/clinical/shell/ClinicalWorkflowPresentation.js';
import { boundaryToStroke } from '../../src/clinical/trim/ClinicalTrimBoundaryMath.js';
import { ClinicalMeshPicker } from '../../src/clinical/display/ClinicalMeshPicker.js';

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

describe('pre-cln011 clinical camera', () => {
  it('requests clinical anterior view with superior-up patient-facing pose', async () => {
    const { h, boot } = await bootCase();
    const result = boot.workspace.viewport.presentClinicalAnteriorView();
    expect(result.ok).toBe(true);
    const after = h.sessions.cameraSession?.getSnapshot();
    expect(after).toBeDefined();
    if (after !== undefined) {
      // PROD-002SC: clinical frame — up is +Y superior, look is elevated +Z anterior.
      expect(Math.abs(after.up.y)).toBeGreaterThan(0.9);
      const toEye = {
        x: after.eye.x - after.target.x,
        y: after.eye.y - after.target.y,
        z: after.eye.z - after.target.z
      };
      const len = Math.hypot(toEye.x, toEye.y, toEye.z);
      const alongAnterior = Math.abs(toEye.z) / len;
      const alongSuperior = Math.abs(toEye.y) / len;
      // Primarily anterior (not occlusal/top).
      expect(alongAnterior).toBeGreaterThan(0.75);
      expect(alongSuperior).toBeLessThan(0.5);
      // Modest elevation along superior (patient-facing, not dead-flat).
      expect(alongSuperior).toBeGreaterThan(0.05);
      expect(toEye.z).toBeGreaterThan(0);
    }
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('pre-cln011 preparation gate', () => {
  it('orientation accept auto-prepares and unlocks Trim', async () => {
    const { h, boot } = await bootCase();
    boot.workspace.preparation.notifyOrientationComplete();
    const prepared = boot.workspace.preparation.autoPrepare();
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.value.ok).toBe(true);
    }
    expect(boot.workspace.preparation.isReadyForGeometry()).toBe(true);
    const presentationReady = buildClinicalWorkflowPresentation(boot.workspace);
    expect(presentationReady.currentStepId).toBe('prepare');
    expect(presentationReady.primaryAction.label).toBe('Continue to Trim');

    // Idempotent auto-prepare
    expect(boot.workspace.preparation.autoPrepare().ok).toBe(true);
    expect(boot.workspace.preparation.isReadyForGeometry()).toBe(true);

    boot.runtime.dispose();
    h.dispose();
  });

  it('preparation → trim transition works', async () => {
    const { h, boot } = await bootCase();
    boot.workspace.preparation.notifyOrientationComplete();
    expect(boot.workspace.preparation.confirmReadyForTrim().ok).toBe(true);
    h.sessions.selectionSession?.select('replace', ['upper-arch']);
    expect(boot.workspace.trim.enter().ok).toBe(true);
    expect(boot.workspace.trim.isActive()).toBe(true);
    expect(boot.workspace.trim.session.getState().drawMode).toBe('idle');
    boot.workspace.trim.cancel();
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('pre-cln011 trim pointer ownership and modes', () => {
  it('starts idle; polyline/freehand modes; toolbar commands work while active', async () => {
    const { h, boot } = await bootCase();
    boot.workspace.preparation.notifyOrientationComplete();
    expect(boot.workspace.preparation.confirmReadyForTrim().ok).toBe(true);
    expect(boot.workspace.trim.enter().ok).toBe(true);
    expect(boot.workspace.trim.session.getState().drawMode).toBe('idle');

    // Idle rejects drawing
    expect(boot.workspace.trim.addPoint({ x: 10, y: 10 }).ok).toBe(false);

    expect(boot.workspace.trim.setDrawMode('polyline').ok).toBe(true);
    expect(boot.workspace.trim.addPoint({ x: 10, y: 10 }).ok).toBe(true);
    expect(boot.workspace.trim.addPoint({ x: 40, y: 10 }).ok).toBe(true);
    expect(boot.workspace.trim.addPoint({ x: 40, y: 40 }).ok).toBe(true);
    expect(boot.workspace.trim.session.getState().points).toHaveLength(3);

    expect(boot.workspace.trim.undoPoint().ok).toBe(true);
    expect(boot.workspace.trim.session.getState().points).toHaveLength(2);
    expect(boot.workspace.trim.addPoint({ x: 40, y: 40 }).ok).toBe(true);
    expect(boot.workspace.trim.closeBoundary().ok).toBe(true);
    expect(boot.workspace.trim.session.getState().closed).toBe(true);

    const validated = boot.workspace.trim.validate();
    expect(validated.ok).toBe(true);
    expect(boot.workspace.trim.session.getState().points.length).toBeGreaterThanOrEqual(3);

    expect(boot.workspace.trim.setDrawMode('freehand').ok).toBe(true);
    expect(boot.workspace.trim.resetDrawing().ok).toBe(true);
    expect(boot.workspace.trim.session.getState().drawMode).toBe('idle');
    expect(boot.workspace.trim.session.getState().points).toHaveLength(0);

    // Pointer capture released on cancel / reset
    expect(boot.workspace.trim.setDrawMode('polyline').ok).toBe(true);
    boot.workspace.trim.controller.beginDraw(7);
    expect(boot.workspace.trim.controller.isPointerCaptured()).toBe(true);
    boot.workspace.trim.controller.endDraw();
    expect(boot.workspace.trim.controller.isPointerCaptured()).toBe(false);

    boot.workspace.trim.controller.beginDraw(8);
    expect(boot.workspace.trim.cancel().ok).toBe(true);
    expect(boot.workspace.trim.controller.isPointerCaptured()).toBe(false);
    expect(boot.workspace.trim.isActive()).toBe(false);

    boot.runtime.dispose();
    h.dispose();
  });

  it('validate reports actionable messages for empty and open boundaries', async () => {
    const { h, boot } = await bootCase();
    boot.workspace.preparation.notifyOrientationComplete();
    expect(boot.workspace.preparation.confirmReadyForTrim().ok).toBe(true);
    expect(boot.workspace.trim.enter().ok).toBe(true);
    expect(boot.workspace.trim.setDrawMode('polyline').ok).toBe(true);

    const empty = boot.workspace.trim.validate();
    expect(empty.ok).toBe(false);
    expect(empty.ok === false && empty.error.message).toMatch(/at least 3 points/i);

    boot.workspace.trim.addPoint({ x: 1, y: 1 });
    boot.workspace.trim.addPoint({ x: 20, y: 1 });
    boot.workspace.trim.addPoint({ x: 20, y: 20 });
    const open = boot.workspace.trim.validate();
    expect(open.ok).toBe(false);
    expect(open.ok === false && open.error.message).toMatch(/close/i);

    boot.workspace.trim.cancel();
    boot.runtime.dispose();
    h.dispose();
  });

  it('drawing / validate / cancel / reset do not mutate document revision', async () => {
    const { h, boot } = await bootCase();
    boot.workspace.preparation.notifyOrientationComplete();
    expect(boot.workspace.preparation.confirmReadyForTrim().ok).toBe(true);
    expect(boot.workspace.trim.enter().ok).toBe(true);
    // Isolation may bump revision once on enter; drawing/validate must not.
    const revAfterEnter = boot.session.getPublicState().activeCase!.revision;
    expect(boot.workspace.trim.setDrawMode('polyline').ok).toBe(true);
    boot.workspace.trim.addPoint({ x: 1, y: 1 });
    boot.workspace.trim.addPoint({ x: 20, y: 1 });
    boot.workspace.trim.addPoint({ x: 20, y: 20 });
    boot.workspace.trim.closeBoundary();
    boot.workspace.trim.validate();
    expect(boot.session.getPublicState().activeCase!.revision).toBe(revAfterEnter);
    boot.workspace.trim.resetDrawing();
    expect(boot.session.getPublicState().activeCase!.revision).toBe(revAfterEnter);
    boot.workspace.trim.cancel();
    // Cancel restores arch visibility (showAll) — expected revision bump, not geometry edit.
    expect(boot.session.getPublicState().activeCase!.revision).toBeGreaterThanOrEqual(
      revAfterEnter
    );
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('pre-cln011 active arch + picking', () => {
  it('resolves upper/lower target from selection; rejects hidden', async () => {
    const { h, boot, upper, lower } = await bootCase();
    h.sessions.selectionSession?.select('replace', ['upper-arch']);
    const t1 = boot.workspace.trim.manager.resolveTarget(boot.session);
    expect(t1.ok && t1.value.objectId).toBe(upper.id);

    h.sessions.selectionSession?.select('replace', ['lower-arch']);
    const t2 = boot.workspace.trim.manager.resolveTarget(boot.session);
    expect(t2.ok && t2.value.objectId).toBe(lower.id);

    const doc = boot.session.getPublicState().activeCase!;
    const hiddenLower = mesh('lower-arch', 'Lower Arch', 'lower', false);
    expect(
      boot.session.applyDocument(withClinicalObjects(doc, [upper, hiddenLower], 1002), true).ok
    ).toBe(true);
    h.sessions.selectionSession?.select('replace', ['lower-arch']);
    const t3 = boot.workspace.trim.manager.resolveTarget(boot.session);
    expect(t3.ok).toBe(false);

    boot.runtime.dispose();
    h.dispose();
  });

  it('mesh picker returns registered hits and prefers active object', async () => {
    const picker = new ClinicalMeshPicker();
    const unsub = picker.register((input) => {
      if (input.preferredObjectId === 'upper-arch') {
        return Object.freeze({
          objectId: 'upper-arch',
          screenX: input.screenX,
          screenY: input.screenY,
          worldX: 1,
          worldY: 2,
          worldZ: 3,
          localX: 1,
          localY: 2,
          localZ: 3,
          meshX: 4,
          meshY: 5,
          faceIndex: 0
        });
      }
      return undefined;
    });
    const hit = picker.pick({
      screenX: 100,
      screenY: 200,
      canvasWidth: 800,
      canvasHeight: 600,
      preferredObjectId: 'upper-arch'
    });
    expect(hit?.objectId).toBe('upper-arch');
    expect(hit?.meshX).toBe(4);
    expect(picker.getLastHit()?.worldZ).toBe(3);
    unsub();
    expect(picker.isReady()).toBe(false);
  });

  it('boundaryToStroke prefers surface mesh XY as normalized AABB coords', async () => {
    const stroke = boundaryToStroke(
      [
        { x: 10, y: 10, meshX: 0, meshY: 0 },
        { x: 20, y: 10, meshX: 50, meshY: 0 },
        { x: 20, y: 20, meshX: 50, meshY: 25 }
      ],
      { minX: 0, minY: 0, spanX: 50, spanY: 25 }
    );
    expect(stroke[0]).toEqual([0, 0]);
    expect(stroke[1]).toEqual([1, 0]);
    expect(stroke[2]).toEqual([1, 1]);
  });
});

describe('pre-cln011 camera stability helpers', () => {
  it('trim cancel does not call clinical anterior re-fit', async () => {
    const { h, boot } = await bootCase();
    boot.workspace.preparation.notifyOrientationComplete();
    expect(boot.workspace.preparation.confirmReadyForTrim().ok).toBe(true);
    boot.workspace.viewport.presentClinicalAnteriorView();
    expect(boot.workspace.trim.enter().ok).toBe(true);
    // Enter may fit the isolated active arch; cancel must not re-apply anterior.
    const eyeAfterEnter = { ...h.sessions.cameraSession!.getSnapshot().eye };
    boot.workspace.trim.cancel();
    const after = h.sessions.cameraSession!.getSnapshot().eye;
    expect(after.x).toBeCloseTo(eyeAfterEnter.x, 10);
    expect(after.y).toBeCloseTo(eyeAfterEnter.y, 10);
    expect(after.z).toBeCloseTo(eyeAfterEnter.z, 10);
    boot.runtime.dispose();
    h.dispose();
  });
});
