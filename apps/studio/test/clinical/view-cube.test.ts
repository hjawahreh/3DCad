/**
 * Clinical View Cube — deterministic camera basis for canonical views.
 */

import { describe, expect, it } from 'vitest';
import {
  CLINICAL_VIEW_FACE_BASIS,
  buildClinicalViewSnapshot,
  clinicalCameraBasisFromSnapshot,
  clinicalViewBasisAtOrigin,
  resolveClosestClinicalFace,
  viewDirectionFromSnapshot
} from '../../src/clinical/display/ClinicalViewCubeMath.js';
import { applyClinicalAnteriorPose } from '../../src/clinical/display/ClinicalAnteriorCamera.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import type { CameraSnapshot } from '@cad-studio/camera-runtime';

const approx = (value: number, expected: number, eps = 1e-6): void => {
  expect(Math.abs(value - expected)).toBeLessThanOrEqual(eps);
};

const expectVec3 = (
  v: { readonly x: number; readonly y: number; readonly z: number },
  x: number,
  y: number,
  z: number,
  eps = 1e-6
): void => {
  approx(v.x, x, eps);
  approx(v.y, y, eps);
  approx(v.z, z, eps);
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

describe('ClinicalViewCubeMath canonical basis', () => {
  it('maps Front/Back/Left/Right/Top/Bottom to clinical frame axes at origin', () => {
    expectVec3(clinicalViewBasisAtOrigin('front').eye, 0, 0, 1);
    expectVec3(clinicalViewBasisAtOrigin('front').up, 0, 1, 0);

    expectVec3(clinicalViewBasisAtOrigin('back').eye, 0, 0, -1);
    expectVec3(clinicalViewBasisAtOrigin('back').up, 0, 1, 0);

    expectVec3(clinicalViewBasisAtOrigin('left').eye, 1, 0, 0);
    expectVec3(clinicalViewBasisAtOrigin('left').up, 0, 1, 0);

    expectVec3(clinicalViewBasisAtOrigin('right').eye, -1, 0, 0);
    expectVec3(clinicalViewBasisAtOrigin('right').up, 0, 1, 0);

    expectVec3(clinicalViewBasisAtOrigin('top').eye, 0, 1, 0);
    expectVec3(clinicalViewBasisAtOrigin('top').up, 0, 0, -1);

    expectVec3(clinicalViewBasisAtOrigin('bottom').eye, 0, -1, 0);
    expectVec3(clinicalViewBasisAtOrigin('bottom').up, 0, 0, 1);
  });

  it('buildClinicalViewSnapshot preserves radius and target', () => {
    const current = baseSnapshot();
    const left = buildClinicalViewSnapshot(current, 'left');
    expectVec3(left.target, 0, 0, 0);
    expectVec3(left.up, 0, 1, 0);
    expectVec3(left.eye, 10, 0, 0);

    const top = buildClinicalViewSnapshot(current, 'top');
    expectVec3(top.eye, 0, 10, 0);
    expectVec3(top.up, 0, 0, -1);
  });

  it('resolveClosestClinicalFace highlights the active canonical view', () => {
    for (const face of Object.keys(CLINICAL_VIEW_FACE_BASIS) as Array<
      keyof typeof CLINICAL_VIEW_FACE_BASIS
    >) {
      const snap = buildClinicalViewSnapshot(baseSnapshot(), face);
      expect(resolveClosestClinicalFace(snap)).toBe(face);
      const dir = viewDirectionFromSnapshot(snap);
      if (face === 'front') {
        // Canonical Ant includes mild elevation — still clearly anterior.
        expect(dir.z).toBeGreaterThan(0.9);
        expect(dir.y).toBeGreaterThan(0);
        expect(dir.y).toBeLessThan(0.35);
      } else {
        expectVec3(
          dir,
          CLINICAL_VIEW_FACE_BASIS[face].look.x,
          CLINICAL_VIEW_FACE_BASIS[face].look.y,
          CLINICAL_VIEW_FACE_BASIS[face].look.z
        );
      }
    }
  });
});

describe('ClinicalViewCube integration', () => {
  it('Home restores clinical anterior view with +Z look and +Y up', async () => {
    const h = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 1000 }
    });
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
    expect(
      boot.session.applyDocument(withClinicalObjects(doc, [mesh('u', 'Upper')], 1001), true).ok
    ).toBe(true);

    const camera = h.sessions.cameraSession!;
    camera.presetView('left');
    expect(boot.workspace.viewport.presentClinicalAnteriorView({ preferClinicalFrame: true }).ok).toBe(
      true
    );

    const snap = camera.getSnapshot();
    const viewDir = viewDirectionFromSnapshot(snap);
    expect(viewDir.z).toBeGreaterThan(0.7);
    expect(snap.up.y).toBeGreaterThan(0.9);
  });

  it('presentClinicalCubeView applies patient-left (+X) and patient-right (−X) views', async () => {
    const h = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 2000 }
    });
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
    expect(
      boot.session.applyDocument(withClinicalObjects(doc, [mesh('u', 'Upper')], 1001), true).ok
    ).toBe(true);

    boot.workspace.viewport.presentClinicalAnteriorView({ preferClinicalFrame: true });
    expect(boot.workspace.viewport.presentClinicalCubeView('left').ok).toBe(true);
    let snap = h.sessions.cameraSession!.getSnapshot();
    expectVec3(viewDirectionFromSnapshot(snap), 1, 0, 0, 0.05);

    expect(boot.workspace.viewport.presentClinicalCubeView('right').ok).toBe(true);
    snap = h.sessions.cameraSession!.getSnapshot();
    expectVec3(viewDirectionFromSnapshot(snap), -1, 0, 0, 0.05);
  });

  it('applyClinicalAnteriorPose and View Cube Ant share elevated anterior axis', async () => {
    const h = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 3000 }
    });
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
    expect(
      boot.session.applyDocument(withClinicalObjects(doc, [mesh('u', 'Upper')], 1001), true).ok
    ).toBe(true);
    const camera = h.sessions.cameraSession!;
    applyClinicalAnteriorPose(camera, DEFAULT_MESH_BOUNDS, { preferClinicalFrame: true });
    const anterior = clinicalCameraBasisFromSnapshot(camera.getSnapshot());
    expect(boot.workspace.viewport.presentClinicalCubeView('front').ok).toBe(true);
    const front = clinicalCameraBasisFromSnapshot(camera.getSnapshot());
    expect(anterior.up.y).toBeGreaterThan(0.9);
    expect(anterior.forward.z).toBeGreaterThan(0.9);
    expect(front.forward.z).toBeGreaterThan(0.9);
    expect(front.closestFace).toBe('front');
  });
});
