/**
 * PROD-002SC — Canonical Anterior camera = View Cube Ant + BOTH fit.
 */

import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { registerParsedClinicalMesh } from '../../src/clinical/import/ClinicalMeshRegistration.js';
import { computeAABB } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import {
  CANONICAL_CLINICAL_ANTERIOR_FACE,
  clinicalCameraBasesEqual,
  clinicalCameraBasisFromSnapshot
} from '../../src/clinical/display/ClinicalViewCubeMath.js';
import { unionOrientedBounds } from '../../src/clinical/document/ClinicalDocument.js';
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

const bootOriented = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 45000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'PROD-002SC', patientName: 'Test' }).ok).toBe(true);
  await importDualArch(clinical.workspace);
  seedDenseArches(host, clinical.session);
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.session.getState().orientationOrigin).toBe('auto');
  return { host, clinical };
};

describe('PROD-002SC canonical anterior orientation', () => {
  it('A — Auto Orientation camera direction is Anterior (View Cube front)', async () => {
    const { host, clinical } = await bootOriented();
    const basis = clinical.workspace.viewport.getClinicalCameraBasis();
    expect(basis).toBeDefined();
    expect(basis!.closestFace).toBe(CANONICAL_CLINICAL_ANTERIOR_FACE);
    expect(basis!.forward.z).toBeGreaterThan(0.7);
    expect(basis!.up.y).toBeGreaterThan(0.85);
    expect(clinical.workspace.archContext.getMode()).toBe('both');
    clinical.runtime.dispose();
    host.dispose();
  });

  it('B — View Cube Anterior matches Auto Orient camera basis', async () => {
    const { host, clinical } = await bootOriented();
    const autoBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    expect(clinical.workspace.viewport.presentClinicalCubeView('front').ok).toBe(true);
    const cubeBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    expect(clinicalCameraBasesEqual(autoBasis, cubeBasis)).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('C — Home matches Auto Orient camera basis', async () => {
    const { host, clinical } = await bootOriented();
    const autoBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    expect(clinical.workspace.viewport.resetView().ok).toBe(true);
    const homeBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    expect(clinicalCameraBasesEqual(autoBasis, homeBasis)).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('D — Home restores canonical Anterior after manual rotate', async () => {
    const { host, clinical } = await bootOriented();
    const autoBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    host.sessions.cameraSession!.presetView('left');
    const left = clinicalCameraBasisFromSnapshot(host.sessions.cameraSession!.getSnapshot());
    expect(clinicalCameraBasesEqual(autoBasis, left)).toBe(false);
    expect(clinical.workspace.viewport.resetView().ok).toBe(true);
    const homeBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    expect(clinicalCameraBasesEqual(autoBasis, homeBasis)).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('E — BOTH uses combined visible bounds for fit target', async () => {
    const { host, clinical } = await bootOriented();
    expect(clinical.workspace.archContext.getMode()).toBe('both');
    const orientState = clinical.workspace.orientation.session.getState();
    const doc = clinical.session.getPublicState().activeCase!;
    const previewDoc = clinical.workspace.orientation.controller.manager.previewCaseDocument(
      doc,
      orientState.preview
    );
    const visible = previewDoc.objects.filter((o) => o.visible);
    expect(visible.length).toBeGreaterThanOrEqual(2);
    const bounds = unionOrientedBounds(visible)!;
    const basis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    const cx = (bounds.min.x + bounds.max.x) * 0.5;
    const cy = (bounds.min.y + bounds.max.y) * 0.5;
    const cz = (bounds.min.z + bounds.max.z) * 0.5;
    expect(Math.hypot(basis.target.x - cx, basis.target.y - cy, basis.target.z - cz)).toBeLessThan(
      1.5
    );
    clinical.runtime.dispose();
    host.dispose();
  });

  it('F — UPPER fit uses upper-only bounds; clinical direction unchanged', async () => {
    const { host, clinical } = await bootOriented();
    const bothBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    clinical.workspace.archContext.setMode('upper');
    const upper = clinical.session
      .getPublicState()
      .activeCase!.objects.find((o) => o.archRole === 'upper')!;
    clinical.workspace.viewport.isolate(upper.id);
    expect(clinical.workspace.viewport.presentCanonicalClinicalView('front').ok).toBe(true);
    const upperBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    expect(upperBasis.closestFace).toBe('front');
    expect(upperBasis.forward.z).toBeGreaterThan(0.7);
    // Direction matches; target may shift with upper-only bounds.
    expect(
      upperBasis.forward.x * bothBasis.forward.x +
        upperBasis.forward.y * bothBasis.forward.y +
        upperBasis.forward.z * bothBasis.forward.z
    ).toBeGreaterThan(0.95);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('G — LOWER fit uses lower-only bounds; clinical direction unchanged', async () => {
    const { host, clinical } = await bootOriented();
    const bothBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    clinical.workspace.archContext.setMode('lower');
    const lower = clinical.session
      .getPublicState()
      .activeCase!.objects.find((o) => o.archRole === 'lower')!;
    clinical.workspace.viewport.isolate(lower.id);
    expect(clinical.workspace.viewport.presentCanonicalClinicalView('front').ok).toBe(true);
    const lowerBasis = clinical.workspace.viewport.getClinicalCameraBasis()!;
    expect(lowerBasis.closestFace).toBe('front');
    expect(
      lowerBasis.forward.x * bothBasis.forward.x +
        lowerBasis.forward.y * bothBasis.forward.y +
        lowerBasis.forward.z * bothBasis.forward.z
    ).toBeGreaterThan(0.95);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('H — Re-run Auto Orient restores identical canonical camera basis', async () => {
    const { host, clinical } = await bootOriented();
    const initial = clinical.workspace.viewport.getClinicalCameraBasis()!;
    host.sessions.cameraSession!.presetView('top');
    expect(clinical.workspace.orientation.autoOrient({ force: true }).ok).toBe(true);
    const rerun = clinical.workspace.viewport.getClinicalCameraBasis()!;
    expect(clinicalCameraBasesEqual(initial, rerun)).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});
