/**
 * Clinical auto-orientation — estimator + workflow Vitest suite.
 */

import { describe, expect, it } from 'vitest';
import {
  estimateClinicalOrientation,
  mat4FromClinicalAxes,
  samplePositions,
  AUTO_ORIENTATION_ALGORITHM_VERSION
} from '../../src/clinical/orientation/ClinicalAutoOrientationEstimator.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { MemoryClinicalCasePersistence } from '../../src/clinical/case/ClinicalCasePersistence.js';
import { ClinicalWorkspace } from '../../src/clinical/workspace/ClinicalWorkspace.js';
import { isIdentityTransform } from '../../src/clinical/orientation/ClinicalTransformMath.js';
import { registerParsedClinicalMesh } from '../../src/clinical/import/ClinicalMeshRegistration.js';
import { computeAABB } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import type { ClinicalSession } from '../../src/clinical/runtime/session.js';

/** Minimal binary STL with one triangle (insufficient for PCA alone). */
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

/**
 * U-shaped arch in XY, open toward +Y (tip toward −Y), thickness in Z.
 * Lateral variance is higher at the molar arms (+Y opening) than at the tip.
 */
const makeArchPositions = (options?: {
  readonly zOffset?: number;
  readonly rotateZDeg?: number;
  readonly translate?: { readonly x: number; readonly y: number; readonly z: number };
  readonly scale?: number;
  readonly samples?: number;
  readonly thickness?: number;
  readonly layers?: number;
}): Float32Array => {
  const samples = options?.samples ?? 64;
  const zOffset = options?.zOffset ?? 0;
  const scale = options?.scale ?? 1;
  const thickness = options?.thickness ?? 4;
  const layers = Math.max(2, options?.layers ?? 5);
  const translate = options?.translate ?? { x: 0, y: 0, z: 0 };
  const rot = ((options?.rotateZDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const out: number[] = [];

  const pushRing = (radiusX: number, radiusY: number, zLocal: number): void => {
    for (let i = 0; i <= samples; i += 1) {
      const t = (i / samples) * Math.PI;
      // Tip at −Y, arms at y≈0 → opening faces +Y.
      let x = radiusX * Math.cos(t) * scale;
      let y = -radiusY * Math.sin(t) * scale;
      let z = zLocal * scale;
      const xr = x * cos - y * sin;
      const yr = x * sin + y * cos;
      out.push(xr + translate.x, yr + translate.y, z + translate.z);
    }
  };

  for (let layer = 0; layer < layers; layer += 1) {
    const zLocal = (layer / (layers - 1) - 0.5) * thickness + zOffset;
    pushRing(42, 58, zLocal);
    pushRing(34, 48, zLocal);
    pushRing(26, 38, zLocal);
  }

  return new Float32Array(out);
};

/** Triangle-fan indices over a flat vertex list (deterministic normals). */
const fanIndices = (vertexCount: number): Uint32Array => {
  if (vertexCount < 3) return new Uint32Array(0);
  const tris = vertexCount - 2;
  const indices = new Uint32Array(tris * 3);
  for (let i = 0; i < tris; i += 1) {
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = i + 2;
  }
  return indices;
};

const archSample = (
  objectId: string,
  archRole: 'upper' | 'lower' | undefined,
  positions: Float32Array
) =>
  Object.freeze({
    objectId,
    archRole,
    positions,
    indices: fanIndices(Math.floor(positions.length / 3))
  });

const centroidOfPositions = (positions: Float32Array): { x: number; y: number; z: number } => {
  const n = Math.floor(positions.length / 3);
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < n; i += 1) {
    sx += positions[i * 3]!;
    sy += positions[i * 3 + 1]!;
    sz += positions[i * 3 + 2]!;
  }
  return { x: sx / n, y: sy / n, z: sz / n };
};

const applyMat4 = (
  m: { readonly elements: readonly number[] },
  p: { readonly x: number; readonly y: number; readonly z: number }
): { x: number; y: number; z: number } => {
  const e = m.elements;
  return {
    x: e[0]! * p.x + e[4]! * p.y + e[8]! * p.z + e[12]!,
    y: e[1]! * p.x + e[5]! * p.y + e[9]! * p.z + e[13]!,
    z: e[2]! * p.x + e[6]! * p.y + e[10]! * p.z + e[14]!
  };
};

const boot = () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 11000 }
  });
  const runtimeBoot = new ClinicalBootstrap().bootstrap(host);
  const persistence = new MemoryClinicalCasePersistence();
  const workspace = new ClinicalWorkspace(runtimeBoot.session, undefined, persistence);
  return {
    host,
    runtime: runtimeBoot.runtime,
    session: runtimeBoot.session,
    workspace,
    persistence
  };
};

const attach = async (host: StudioCompositionRoot) => {
  expect(
    await host.attachViewport({
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      getContext: () => null
    })
  ).toBe(true);
};

/**
 * Replace tiny imported STL registry meshes with dense U-arches so PCA has geometry.
 */
const seedDenseArches = (
  host: StudioCompositionRoot,
  session: ClinicalSession,
  options?: {
    readonly upperZ?: number;
    readonly lowerZ?: number;
    readonly rotateZDeg?: number;
    readonly scale?: number;
  }
): void => {
  const doc = session.getPublicState().activeCase;
  expect(doc).toBeDefined();
  if (doc === undefined) return;
  const registry = host.runtimes.kernel.registry;
  for (const obj of doc.objects) {
    if (obj.archRole !== 'upper' && obj.archRole !== 'lower') continue;
    const zOffset =
      obj.archRole === 'upper' ? (options?.upperZ ?? 14) : (options?.lowerZ ?? -14);
    const positions = makeArchPositions({
      zOffset,
      ...(options?.rotateZDeg !== undefined ? { rotateZDeg: options.rotateZDeg } : {}),
      ...(options?.scale !== undefined ? { scale: options.scale } : {})
    });
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

describe('estimator', () => {
  it('is deterministic for identical arch samples', () => {
    const upper = makeArchPositions({ zOffset: 12 });
    const lower = makeArchPositions({ zOffset: -12 });
    const arches = [
      archSample('u', 'upper', upper),
      archSample('l', 'lower', lower)
    ];
    const a = estimateClinicalOrientation(arches);
    const b = estimateClinicalOrientation(arches);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.algorithmVersion).toBe(AUTO_ORIENTATION_ALGORITHM_VERSION);
    expect(a.transform.elements).toEqual(b.transform.elements);
    expect(a.axes.left).toEqual(b.axes.left);
    expect(a.axes.superior).toEqual(b.axes.superior);
    expect(a.axes.anterior).toEqual(b.axes.anterior);
  });

  it('is translation invariant for clinical axes', () => {
    const baseUpper = makeArchPositions({ zOffset: 10 });
    const baseLower = makeArchPositions({ zOffset: -10 });
    const shiftedUpper = makeArchPositions({
      zOffset: 10,
      translate: { x: 25, y: -40, z: 7 }
    });
    const shiftedLower = makeArchPositions({
      zOffset: -10,
      translate: { x: 25, y: -40, z: 7 }
    });
    const base = estimateClinicalOrientation([
      archSample('u', 'upper', baseUpper),
      archSample('l', 'lower', baseLower)
    ]);
    const shifted = estimateClinicalOrientation([
      archSample('u', 'upper', shiftedUpper),
      archSample('l', 'lower', shiftedLower)
    ]);
    expect(base.ok).toBe(true);
    expect(shifted.ok).toBe(true);
    expect(shifted.axes.left.x).toBeCloseTo(base.axes.left.x, 5);
    expect(shifted.axes.left.y).toBeCloseTo(base.axes.left.y, 5);
    expect(shifted.axes.left.z).toBeCloseTo(base.axes.left.z, 5);
    expect(shifted.axes.superior.x).toBeCloseTo(base.axes.superior.x, 5);
    expect(shifted.axes.superior.y).toBeCloseTo(base.axes.superior.y, 5);
    expect(shifted.axes.superior.z).toBeCloseTo(base.axes.superior.z, 5);
    expect(shifted.axes.anterior.x).toBeCloseTo(base.axes.anterior.x, 5);
    expect(shifted.axes.anterior.y).toBeCloseTo(base.axes.anterior.y, 5);
    expect(shifted.axes.anterior.z).toBeCloseTo(base.axes.anterior.z, 5);
  });

  it('is scale invariant for clinical axes', () => {
    const base = estimateClinicalOrientation([
      archSample('u', 'upper', makeArchPositions({ zOffset: 10, scale: 1 })),
      archSample('l', 'lower', makeArchPositions({ zOffset: -10, scale: 1 }))
    ]);
    const scaled = estimateClinicalOrientation([
      archSample('u', 'upper', makeArchPositions({ zOffset: 10, scale: 2.5 })),
      archSample('l', 'lower', makeArchPositions({ zOffset: -10, scale: 2.5 }))
    ]);
    expect(base.ok).toBe(true);
    expect(scaled.ok).toBe(true);
    expect(scaled.axes.left.x).toBeCloseTo(base.axes.left.x, 4);
    expect(scaled.axes.left.y).toBeCloseTo(base.axes.left.y, 4);
    expect(scaled.axes.left.z).toBeCloseTo(base.axes.left.z, 4);
    expect(scaled.axes.superior.x).toBeCloseTo(base.axes.superior.x, 4);
    expect(scaled.axes.superior.y).toBeCloseTo(base.axes.superior.y, 4);
    expect(scaled.axes.superior.z).toBeCloseTo(base.axes.superior.z, 4);
    expect(scaled.axes.anterior.x).toBeCloseTo(base.axes.anterior.x, 4);
    expect(scaled.axes.anterior.y).toBeCloseTo(base.axes.anterior.y, 4);
    expect(scaled.axes.anterior.z).toBeCloseTo(base.axes.anterior.z, 4);
  });

  it('signs superior from dual-arch upper/lower centroids', () => {
    const estimate = estimateClinicalOrientation([
      archSample('u', 'upper', makeArchPositions({ zOffset: 16 })),
      archSample('l', 'lower', makeArchPositions({ zOffset: -16 }))
    ]);
    expect(estimate.ok).toBe(true);
    expect(estimate.hasUpper).toBe(true);
    expect(estimate.hasLower).toBe(true);
    // Thin extent is Z; upper is above lower → superior ≈ +Z.
    expect(estimate.axes.superior.z).toBeGreaterThan(0.85);
    expect(Math.abs(estimate.axes.superior.x)).toBeLessThan(0.25);
    expect(Math.abs(estimate.axes.superior.y)).toBeLessThan(0.25);
  });

  it('preserves relative upper/lower offset under the case-level transform', () => {
    const upper = makeArchPositions({ zOffset: 12, translate: { x: 0, y: 0, z: 0 } });
    const lower = makeArchPositions({ zOffset: -12, translate: { x: 3, y: -2, z: 0 } });
    const estimate = estimateClinicalOrientation([
      archSample('u', 'upper', upper),
      archSample('l', 'lower', lower)
    ]);
    expect(estimate.ok).toBe(true);
    const upC = centroidOfPositions(upper);
    const loC = centroidOfPositions(lower);
    const beforeDist = Math.hypot(upC.x - loC.x, upC.y - loC.y, upC.z - loC.z);
    const upT = applyMat4(estimate.transform, upC);
    const loT = applyMat4(estimate.transform, loC);
    const afterDist = Math.hypot(upT.x - loT.x, upT.y - loT.y, upT.z - loT.z);
    expect(afterDist).toBeCloseTo(beforeDist, 5);
    // Superior maps to +Y after orientation.
    expect(upT.y).toBeGreaterThan(loT.y);
  });

  it('fails for empty arch list', () => {
    const failed = estimateClinicalOrientation([]);
    expect(failed.ok).toBe(false);
    expect(failed.confidence).toBe('unavailable');
    expect(failed.algorithmVersion).toBe(AUTO_ORIENTATION_ALGORITHM_VERSION);
    expect(isIdentityTransform(failed.transform)).toBe(true);
    expect(failed.message.toLowerCase()).toMatch(/no scan geometry|could not be determined/);
  });

  it('builds identity mat4 for canonical axes at origin', () => {
    const m = mat4FromClinicalAxes(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 0 }
    );
    expect(isIdentityTransform(m)).toBe(true);
  });

  it('samples positions deterministically', () => {
    const positions = makeArchPositions({ zOffset: 0, samples: 120 });
    const a = samplePositions(positions, 6000);
    const b = samplePositions(positions, 6000);
    expect(a.length).toBeGreaterThan(12);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a[0])).toBe(true);
  });
});

describe('workflow', () => {
  it('auto-orients on enter, accept advances to preparation', async () => {
    const { host, runtime, session, workspace } = boot();
    await attach(host);
    expect(session.newCase({ name: 'Auto Orient Case', patientName: 'Patient' }).ok).toBe(true);
    await importDualArch(workspace);
    seedDenseArches(host, session);

    expect(workspace.orientation.enter().ok).toBe(true);
    expect(workspace.orientation.isActive()).toBe(true);
    const estimate = workspace.orientation.getLastEstimate();
    expect(estimate?.ok).toBe(true);
    expect(workspace.orientation.session.getState().orientationOrigin).toBe('auto');
    expect(isIdentityTransform(workspace.orientation.session.getState().preview)).toBe(false);

    expect(workspace.orientation.accept().ok).toBe(true);
    expect(workspace.orientation.isActive()).toBe(false);
    const doc = session.getPublicState().activeCase!;
    expect(doc.orientationMeta?.acceptedAt).toBeDefined();
    expect(doc.orientationMeta?.source).toBe('auto');
    expect(doc.orientationMeta?.algorithmVersion).toBe(AUTO_ORIENTATION_ALGORITHM_VERSION);
    for (const obj of doc.objects) {
      expect(isIdentityTransform(obj.transform)).toBe(false);
    }
    expect(doc.objects[0]!.transform.elements).toEqual(doc.objects[1]!.transform.elements);

    workspace.preparation.notifyOrientationComplete();
    expect(workspace.preparation.start().ok).toBe(true);
    expect(workspace.preparation.hasSession()).toBe(true);

    runtime.dispose();
    host.dispose();
  });

  it('cancel leaves document transforms unchanged', async () => {
    const { host, runtime, session, workspace } = boot();
    await attach(host);
    expect(session.newCase({ name: 'Cancel Orient', patientName: 'Patient' }).ok).toBe(true);
    await importDualArch(workspace);
    seedDenseArches(host, session);

    const before = session
      .getPublicState()
      .activeCase!.objects.map((o) => o.transform.elements.slice());
    expect(workspace.orientation.enter().ok).toBe(true);
    expect(isIdentityTransform(workspace.orientation.session.getState().preview)).toBe(false);
    expect(workspace.orientation.cancel().ok).toBe(true);
    expect(workspace.orientation.isActive()).toBe(false);

    const after = session.getPublicState().activeCase!.objects;
    expect(after).toHaveLength(before.length);
    for (let i = 0; i < after.length; i += 1) {
      expect(after[i]!.transform.elements).toEqual(before[i]);
      expect(isIdentityTransform(after[i]!.transform)).toBe(true);
    }
    expect(session.getPublicState().activeCase!.orientationMeta).toBeUndefined();

    runtime.dispose();
    host.dispose();
  });

  it('persists accepted orientation and does not re-auto on open', async () => {
    const { host, runtime, session, workspace, persistence } = boot();
    await attach(host);
    expect(
      session.newCase({ name: 'Persist Orient', patientName: 'Patient', patientId: 'P-AO-1' }).ok
    ).toBe(true);
    await importDualArch(workspace);
    seedDenseArches(host, session);

    expect(workspace.orientation.enter().ok).toBe(true);
    expect(workspace.orientation.accept().ok).toBe(true);
    const caseId = session.getPublicState().activeCase!.caseId;
    const accepted = session
      .getPublicState()
      .activeCase!.objects.map((o) => ({
        id: o.id as string,
        elements: o.transform.elements.slice()
      }));
    const meta = session.getPublicState().activeCase!.orientationMeta;
    expect(meta?.acceptedAt).toBeDefined();

    const saved = await workspace.cases.saveActiveCase(workspace);
    expect(saved.ok).toBe(true);

    session.closeCase(true);
    host.runtimes.kernel.registry.clear();
    workspace.importCoordinator.objects.clear();
    expect(session.getPublicState().activeCase).toBeUndefined();

    const opened = await workspace.cases.openCase(workspace, caseId);
    expect(opened.ok).toBe(true);
    const reopened = session.getPublicState().activeCase!;
    expect(reopened.orientationMeta?.acceptedAt).toBe(meta!.acceptedAt);
    expect(reopened.orientationMeta?.algorithmVersion).toBe(AUTO_ORIENTATION_ALGORITHM_VERSION);
    for (const prev of accepted) {
      const obj = reopened.objects.find((o) => (o.id as string) === prev.id);
      expect(obj).toBeDefined();
      expect(obj!.transform.elements).toEqual(prev.elements);
    }

    expect(workspace.orientation.enter().ok).toBe(true);
    // acceptedAt present → enter must not re-run auto (origin stays none).
    expect(workspace.orientation.session.getState().orientationOrigin).toBe('none');
    expect(workspace.orientation.session.getState().preview.elements).toEqual(
      workspace.orientation.session.getState().baseline.elements
    );
    for (const prev of accepted) {
      const obj = session.getPublicState().activeCase!.objects.find(
        (o) => (o.id as string) === prev.id
      );
      expect(obj!.transform.elements).toEqual(prev.elements);
    }
    expect(workspace.orientation.cancel().ok).toBe(true);

    const listed = await persistence.list();
    expect(listed.some((e) => e.caseId === caseId)).toBe(true);

    runtime.dispose();
    host.dispose();
  });

  it('blocks auto after manual refine unless force is set', async () => {
    const { host, runtime, session, workspace } = boot();
    await attach(host);
    expect(session.newCase({ name: 'Manual Block', patientName: 'Patient' }).ok).toBe(true);
    await importDualArch(workspace);
    seedDenseArches(host, session);

    expect(workspace.orientation.enter().ok).toBe(true);
    expect(workspace.orientation.session.getState().orientationOrigin).toBe('auto');
    const autoPreview = workspace.orientation.session.getState().preview.elements.slice();

    expect(workspace.orientation.rotateBy(12, 'y').ok).toBe(true);
    expect(workspace.orientation.session.getState().orientationOrigin).toBe('manual');
    const manualPreview = workspace.orientation.session.getState().preview.elements.slice();
    expect(manualPreview).not.toEqual(autoPreview);

    const blocked = workspace.orientation.autoOrient({ force: false });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.message.toLowerCase()).toMatch(/manual|re-orient/);
    }
    expect(workspace.orientation.session.getState().preview.elements).toEqual(manualPreview);

    const forced = workspace.orientation.autoOrient({ force: true });
    expect(forced.ok).toBe(true);
    if (forced.ok) {
      expect(forced.value.ok).toBe(true);
    }
    expect(workspace.orientation.session.getState().orientationOrigin).toBe('auto');
    expect(workspace.orientation.session.getState().preview.elements).not.toEqual(manualPreview);

    runtime.dispose();
    host.dispose();
  });
});
