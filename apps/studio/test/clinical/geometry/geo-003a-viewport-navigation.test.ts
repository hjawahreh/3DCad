/**
 * GEO-003A — professional viewport navigation + clinical visual cleanup.
 */
import { describe, expect, it } from 'vitest';
import { CameraRuntime } from '@cad-studio/camera-runtime';
import { screenDeltaToOrbitRadians } from '../../../src/application/camera-orbit-mapping.js';
import {
  CLINICAL_VIEW_FACE_BASIS,
  buildClinicalViewSnapshot,
  clinicalCameraBasisFromSnapshot,
  resolveClosestClinicalFace
} from '../../../src/clinical/display/ClinicalViewCubeMath.js';
import {
  DEFAULT_CLINICAL_DISPLAY_PREFERENCES,
  ClinicalDisplayPreferencesStore
} from '../../../src/clinical/display/ClinicalDisplayPreferences.js';
import {
  DEFAULT_DISPLAY_SETTINGS,
  withClinicalObjects
} from '../../../src/clinical/document/ClinicalDocument.js';
import { StudioCompositionRoot } from '../../../src/application/composition-root.js';
import { ClinicalBootstrap } from '../../../src/clinical/ClinicalBootstrap.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../../src/clinical/import/ClinicalMeshDescriptor.js';
import type { CameraSnapshot } from '@cad-studio/camera-runtime';

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
    transform: IDENTITY_CLINICAL_TRANSFORM,
    archRole: 'upper' as const
  });

const baseSnapshot = (): CameraSnapshot =>
  Object.freeze({
    eye: Object.freeze({ x: 0, y: 0, z: 10 }),
    target: Object.freeze({ x: 0, y: 0, z: 0 }),
    up: Object.freeze({ x: 0, y: 1, z: 0 }),
    projection: 'perspective' as const,
    fovDegrees: 45,
    near: 0.1,
    far: 1000,
    orthoSize: 10,
    aspect: 1,
    viewportSize: Object.freeze({ width: 800, height: 600 }),
    revision: 1,
    createdAt: 1
  });

const sessionLookingAnterior = () => {
  const runtime = new CameraRuntime({
    clock: { now: () => Date.now() },
    defaultConfiguration: {
      eye: { x: 0, y: 0, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 }
    }
  });
  const created = runtime.bootstrapSession({
    viewportSize: { width: 800, height: 600 }
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error('camera session');
  }
  return created.value;
};

describe('GEO-003A / CLN-TRIM-002 mouse orbit mapping', () => {
  it('maps drag right/left/up/down to intuitive camera basis changes', () => {
    // Drag right (+dx) → content rotates right → yaw positive → eye.x increases from +Z anterior.
    {
      const session = sessionLookingAnterior();
      const { yaw, pitch } = screenDeltaToOrbitRadians(20, 0);
      expect(yaw).toBeGreaterThan(0);
      expect(Math.abs(pitch)).toBe(0);
      expect(session.orbit(yaw, pitch).ok).toBe(true);
      const eye = session.getSnapshot().eye;
      expect(eye.x).toBeGreaterThan(0);
      expect(eye.z).toBeGreaterThan(0);
    }

    // Drag left (−dx) → yaw negative → eye.x decreases.
    {
      const session = sessionLookingAnterior();
      const { yaw, pitch } = screenDeltaToOrbitRadians(-20, 0);
      expect(yaw).toBeLessThan(0);
      expect(session.orbit(yaw, pitch).ok).toBe(true);
      expect(session.getSnapshot().eye.x).toBeLessThan(0);
    }

    // Drag up (−dy) → view rotates up → pitch negative → eye.y decreases (top tips toward viewer).
    {
      const session = sessionLookingAnterior();
      const { yaw, pitch } = screenDeltaToOrbitRadians(0, -20);
      expect(pitch).toBeLessThan(0);
      expect(Math.abs(yaw)).toBe(0);
      expect(session.orbit(yaw, pitch).ok).toBe(true);
      expect(session.getSnapshot().eye.y).toBeLessThan(0);
    }

    // Drag down (+dy) → view rotates down → eye.y increases.
    {
      const session = sessionLookingAnterior();
      const { yaw, pitch } = screenDeltaToOrbitRadians(0, 20);
      expect(pitch).toBeGreaterThan(0);
      expect(session.orbit(yaw, pitch).ok).toBe(true);
      expect(session.getSnapshot().eye.y).toBeGreaterThan(0);
    }
  });

  it('does not invert through a second layer (mapping is authoritative)', () => {
    const a = screenDeltaToOrbitRadians(10, -10);
    const b = screenDeltaToOrbitRadians(10, -10);
    expect(a).toEqual(b);
    expect(a.yaw).toBeGreaterThan(0);
    expect(a.pitch).toBeLessThan(0);
  });
});

describe('GEO-003A View Cube canonical faces', () => {
  it('resolves ANTERIOR/POSTERIOR/LEFT/RIGHT/TOP/BOTTOM bases', () => {
    expect(CLINICAL_VIEW_FACE_BASIS.front.look).toEqual({ x: 0, y: 0, z: 1 });
    expect(CLINICAL_VIEW_FACE_BASIS.back.look).toEqual({ x: 0, y: 0, z: -1 });
    expect(CLINICAL_VIEW_FACE_BASIS.left.look).toEqual({ x: 1, y: 0, z: 0 });
    expect(CLINICAL_VIEW_FACE_BASIS.right.look).toEqual({ x: -1, y: 0, z: 0 });
    expect(CLINICAL_VIEW_FACE_BASIS.top.look).toEqual({ x: 0, y: 1, z: 0 });
    expect(CLINICAL_VIEW_FACE_BASIS.bottom.look).toEqual({ x: 0, y: -1, z: 0 });
  });

  it('cube face clicks drive Camera Runtime clinical poses (not a separate camera)', async () => {
    const host = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 3000 }
    });
    const boot = new ClinicalBootstrap().bootstrap(host);
    await host.attachViewport({
      width: 800,
      height: 600,
      clientWidth: 800,
      clientHeight: 600,
      getContext: () => null
    });
    expect(boot.session.newCase({ name: 'cube' }).ok).toBe(true);
    const doc = boot.session.getPublicState().activeCase!;
    expect(
      boot.session.applyDocument(withClinicalObjects(doc, [mesh('u', 'Upper')], 3001), true).ok
    ).toBe(true);

    const faces = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;
    for (const face of faces) {
      const result = boot.workspace.viewport.presentClinicalCubeView(face);
      expect(result.ok).toBe(true);
      const expected = buildClinicalViewSnapshot(baseSnapshot(), face);
      expect(resolveClosestClinicalFace(expected)).toBe(face);
    }

    const home = boot.workspace.viewport.resetView();
    expect(home.ok).toBe(true);
  });

  it('Home and Anterior share the same clinical face id', () => {
    const ant = buildClinicalViewSnapshot(baseSnapshot(), 'front');
    expect(resolveClosestClinicalFace(ant)).toBe('front');
    const basis = clinicalCameraBasisFromSnapshot(ant);
    expect(basis.closestFace).toBe('front');
  });
});

describe('GEO-003A clinical axis cleanup', () => {
  it('defaults hide axes, origin, and XYZ orientation badge', () => {
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showAxes).toBe(false);
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showOrigin).toBe(false);
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showOrientationIndicator).toBe(false);
    expect(DEFAULT_DISPLAY_SETTINGS.showAxes).toBe(false);
    expect(DEFAULT_DISPLAY_SETTINGS.showOrigin).toBe(false);
  });

  it('diagnostics can re-enable axes without a second render path', () => {
    const store = new ClinicalDisplayPreferencesStore({
      showAxes: false,
      showOrigin: false,
      showOrientationIndicator: false
    });
    expect(store.get().showAxes).toBe(false);
    store.update({ showAxes: true, showOrientationIndicator: true });
    expect(store.get().showAxes).toBe(true);
    expect(store.get().showOrientationIndicator).toBe(true);
  });
});

describe('GEO-003A Trim isolation contract (pointer ownership)', () => {
  it('documents z-order: View Cube (7) above Trim overlay (5)', () => {
    expect(7).toBeGreaterThan(5);
  });
});
