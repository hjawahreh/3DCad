/**
 * PROD-002R — fresh imported case auto-runs orientation on enter.
 */

import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { registerParsedClinicalMesh } from '../../src/clinical/import/ClinicalMeshRegistration.js';
import { computeAABB } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import { isIdentityTransform } from '../../src/clinical/orientation/ClinicalTransformMath.js';
import { deriveClinicalCasePhase } from '../../src/clinical/case/ClinicalCaseWorkflowStatus.js';
import type { ClinicalSession } from '../../src/clinical/runtime/session.js';

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

const boot = () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 11200 }
  });
  const runtimeBoot = new ClinicalBootstrap().bootstrap(host);
  // Commands register against bootstrap workspace — use that instance for invoke tests.
  return {
    host,
    runtime: runtimeBoot.runtime,
    session: runtimeBoot.session,
    workspace: runtimeBoot.workspace
  };
};

describe('PROD-002R orientation auto-run on fresh import', () => {
  it('enters orientation-ready after dual import with no accepted orientationMeta', async () => {
    const { host, runtime, session, workspace } = boot();
    expect(
      await host.attachViewport({
        width: 640,
        height: 480,
        clientWidth: 640,
        clientHeight: 480,
        getContext: () => null
      })
    ).toBe(true);

    expect(session.newCase({ name: 'Fresh Import', patientName: 'Patient' }).ok).toBe(true);

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

    const doc = session.getPublicState().activeCase!;
    expect(doc.orientationMeta).toBeUndefined();
    expect(deriveClinicalCasePhase(doc)).toBe('orientation-ready');
    seedDenseArches(host, session);

    // Same path as Create Case → Continue to Orientation (clinical.tool.orient).
    const commandOk = await host.commands.invoke('clinical.tool.orient');
    expect(commandOk).toBe(true);
    expect(workspace.orientation.isActive()).toBe(true);
    expect(workspace.orientation.session.getState().orientationOrigin).toBe('auto');
    expect(isIdentityTransform(workspace.orientation.session.getState().preview)).toBe(false);
    expect(workspace.orientation.getLastEstimate()?.ok).toBe(true);

    runtime.dispose();
    host.dispose();
  });

  it('does not re-auto when orientation was already accepted', async () => {
    const { host, runtime, session, workspace } = boot();
    expect(
      await host.attachViewport({
        width: 640,
        height: 480,
        clientWidth: 640,
        clientHeight: 480,
        getContext: () => null
      })
    ).toBe(true);

    expect(session.newCase({ name: 'Accepted Orient', patientName: 'Patient' }).ok).toBe(true);
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
    seedDenseArches(host, session);

    expect(workspace.orientation.enter().ok).toBe(true);
    expect(workspace.orientation.accept().ok).toBe(true);
    expect(session.getPublicState().activeCase!.orientationMeta?.acceptedAt).toBeDefined();

    expect(workspace.orientation.cancel().ok).toBe(true);
    expect(workspace.orientation.enter().ok).toBe(true);
    expect(workspace.orientation.session.getState().orientationOrigin).toBe('none');

    runtime.dispose();
    host.dispose();
  });
});
