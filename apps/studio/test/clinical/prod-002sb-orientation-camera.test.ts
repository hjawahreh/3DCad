/**
 * PROD-002SB — Auto Orient / Re-run / Home share clinical presentation camera.
 */

import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { registerParsedClinicalMesh } from '../../src/clinical/import/ClinicalMeshRegistration.js';
import { computeAABB } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import {
  CLINICAL_FRAME_AXES,
  computeClinicalFitDistance
} from '../../src/clinical/display/ClinicalAnteriorCamera.js';
import { viewDirectionFromSnapshot } from '../../src/clinical/display/ClinicalViewCubeMath.js';
import type { ClinicalSession } from '../../src/clinical/runtime/session.js';
import type { ClinicalWorkspace } from '../../src/clinical/workspace/ClinicalWorkspace.js';

const makeBinaryStl = (offsetY = 0): ArrayBuffer => {
  const buf = new ArrayBuffer(84 + 50);
  const view = new DataView(buf);
  view.setUint32(80, 1, true);
  let o = 84;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 1, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, offsetY, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 10, true);
  o += 4;
  view.setFloat32(o, offsetY, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, offsetY + 10, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setUint16(o, 0, true);
  return buf;
};

const makeArchPositions = (zOffset: number): Float32Array => {
  const samples = 64;
  const out: number[] = [];
  for (let layer = 0; layer < 5; layer += 1) {
    const zLocal = (layer / 4 - 0.5) * 4 + zOffset;
    for (let i = 0; i <= samples; i += 1) {
      const t = (i / samples) * Math.PI;
      out.push(42 * Math.cos(t), -58 * Math.sin(t), zLocal);
    }
  }
  return new Float32Array(out);
};

const fanIndices = (vertexCount: number): Uint32Array => {
  const tris = vertexCount - 2;
  const indices = new Uint32Array(tris * 3);
  for (let i = 0; i < tris; i += 1) {
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = i + 2;
  }
  return indices;
};

const seedDenseArches = (host: StudioCompositionRoot, session: ClinicalSession): void => {
  const doc = session.getPublicState().activeCase;
  expect(doc).toBeDefined();
  if (doc === undefined) return;
  const registry = host.runtimes.kernel.registry;
  for (const obj of doc.objects) {
    if (obj.archRole !== 'upper' && obj.archRole !== 'lower') continue;
    const zOffset = obj.archRole === 'upper' ? 14 : -14;
    const positions = makeArchPositions(zOffset);
    const indices = fanIndices(Math.floor(positions.length / 3));
    const bounds = computeAABB(positions);
    registry.releaseObject(obj.id as string);
    registerParsedClinicalMesh(registry, obj.id as string, {
      positions,
      indices,
      bounds,
      vertexCount: Math.floor(positions.length / 3),
      faceCount: Math.floor(indices.length / 3),
      unitsHint: 'mm',
      warnings: Object.freeze([])
    });
  }
};

const importDualArch = async (workspace: ClinicalWorkspace) => {
  const upper = await workspace.importController.importSelectedFile({
    source: 'file://upper.stl',
    fileName: 'upper.stl',
    extension: 'stl',
    bytes: makeBinaryStl(0),
    archRole: 'upper',
    quiet: true
  });
  expect(upper.ok).toBe(true);
  const lower = await workspace.importController.importSelectedFile({
    source: 'file://lower.stl',
    fileName: 'lower.stl',
    extension: 'stl',
    bytes: makeBinaryStl(20),
    archRole: 'lower',
    quiet: true
  });
  expect(lower.ok).toBe(true);
};

const clinicalPose = (snap: {
  readonly eye: { readonly x: number; readonly y: number; readonly z: number };
  readonly target: { readonly x: number; readonly y: number; readonly z: number };
  readonly up: { readonly x: number; readonly y: number; readonly z: number };
}): boolean => {
  // look = eye−target (camera sits on +Z anterior with mild elevation).
  const dir = viewDirectionFromSnapshot(snap);
  return dir.z > 0.55 && snap.up.y > 0.85;
};

describe('PROD-002SB clinical presentation camera', () => {
  it('computeClinicalFitDistance scales with case bounds', () => {
    const small = computeClinicalFitDistance(
      { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 8, z: 6 } },
      45
    );
    const large = computeClinicalFitDistance(
      { min: { x: 0, y: 0, z: 0 }, max: { x: 120, y: 90, z: 70 } },
      45
    );
    expect(large).toBeGreaterThan(small);
    expect(CLINICAL_FRAME_AXES.anterior).toBe('z');
    expect(CLINICAL_FRAME_AXES.superior).toBe('y');
  });

  it('E — Enter Orientation auto-runs and presents clinical camera with BOTH', async () => {
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
    expect(clinical.session.newCase({ name: 'PROD-002SB Orient', patientName: 'Test' }).ok).toBe(
      true
    );
    await importDualArch(clinical.workspace);
    seedDenseArches(host, clinical.session);

    expect(clinical.workspace.archContext.getMode()).toBe('both');
    expect(clinical.workspace.orientation.enter().ok).toBe(true);
    expect(clinical.workspace.orientation.session.getState().orientationOrigin).toBe('auto');
    expect(clinical.workspace.archContext.getMode()).toBe('both');

    const snap = host.sessions.cameraSession!.getSnapshot();
    expect(clinicalPose(snap)).toBe(true);

    clinical.runtime.dispose();
    host.dispose();
  });

  it('F+G — Re-run Auto Orient and Home match initial clinical presentation', async () => {
    const host = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 34000 }
    });
    const clinical = new ClinicalBootstrap().bootstrap(host);
    await host.attachViewport({
      width: 800,
      height: 600,
      clientWidth: 800,
      clientHeight: 600,
      getContext: () => null
    });
    expect(clinical.session.newCase({ name: 'PROD-002SB Home', patientName: 'Test' }).ok).toBe(
      true
    );
    await importDualArch(clinical.workspace);
    seedDenseArches(host, clinical.session);

    expect(clinical.workspace.orientation.enter().ok).toBe(true);
    const initial = host.sessions.cameraSession!.getSnapshot();
    expect(clinicalPose(initial)).toBe(true);

    host.sessions.cameraSession!.presetView('left');
    expect(clinical.workspace.orientation.autoOrient({ force: true }).ok).toBe(true);
    const rerun = host.sessions.cameraSession!.getSnapshot();
    expect(clinicalPose(rerun)).toBe(true);
    expect(Math.abs(rerun.up.y - initial.up.y)).toBeLessThan(0.05);

    host.sessions.cameraSession!.presetView('top');
    expect(clinical.workspace.viewport.resetView().ok).toBe(true);
    const home = host.sessions.cameraSession!.getSnapshot();
    expect(clinicalPose(home)).toBe(true);

    clinical.runtime.dispose();
    host.dispose();
  });
});
