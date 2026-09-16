/**
 * GEO-001H — local binary geometry delivery (node-host / IPC contract / HTTP fallback).
 */
import {
  createMesh,
  fingerprintMesh,
  normalizeMeshTopology,
  createSurfacePath,
  closeSurfacePath,
  thinSurfacePath,
  HttpGeometryDeliveryClient,
  NodeHostGeometryDeliveryClient,
  probeVtkHttpWorker,
  setGeometryDeliveryClientForTests,
  VtkHttpWorkerBackend,
  encodeBinaryGeometryFrame,
  decodeBinaryGeometryFrame,
  isBinaryGeometryFrame
} from '../../../src/geometry-kernel/index.js';
import { buildSyntheticDentalSurface } from '../../../src/geometry-kernel/mesh/MeshRegistry.js';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterEach } from 'vitest';

afterEach(() => {
  setGeometryDeliveryClientForTests(null);
});

describe('GEO-001H delivery clients', () => {
  it('HTTP fallback never requests file staging in the body helper path', async () => {
    const client = new HttpGeometryDeliveryClient();
    expect(client.mode).toBe('http-fallback');
  });

  it('CGF1 integrity preserved through encode → buffer → decode', () => {
    const mesh = buildSyntheticDentalSurface('h-cgf', 1);
    const enc = encodeBinaryGeometryFrame(mesh.positions, mesh.indices, {
      geometryFingerprint: mesh.fingerprint,
      previewId: 'pv-h'
    });
    expect(isBinaryGeometryFrame(enc.buffer)).toBe(true);
    const dec = decodeBinaryGeometryFrame(enc.buffer);
    expect(fingerprintMesh(dec.positions, dec.indices)).toBe(mesh.fingerprint);
  });
});

describe('GEO-001H node-host local delivery (optional live worker)', () => {
  it('delivers CGF1 via file staging without JSON geometry arrays', async () => {
    if (!(await probeVtkHttpWorker())) {
      console.warn('VTK worker unavailable — skip GEO-001H live node-host');
      return;
    }
    setGeometryDeliveryClientForTests(new NodeHostGeometryDeliveryClient());
    const synth = buildSyntheticDentalSurface(`h-live-${Date.now()}`, 7);
    const mesh = createMesh({
      id: synth.id,
      objectId: synth.objectId,
      role: 'working',
      revision: 1,
      positions: synth.positions,
      indices: synth.indices,
      fingerprint: fingerprintMesh(synth.positions, synth.indices)
    });
    const backend = new VtkHttpWorkerBackend();
    await backend.ensureGeometry(mesh, { caseId: 'geo-001h' });

    const aabb = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, maxZ: -Infinity };
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!;
      const y = mesh.positions[i + 1]!;
      const z = mesh.positions[i + 2]!;
      if (x < aabb.minX) aabb.minX = x;
      if (x > aabb.maxX) aabb.maxX = x;
      if (y < aabb.minY) aabb.minY = y;
      if (y > aabb.maxY) aabb.maxY = y;
      if (z > aabb.maxZ) aabb.maxZ = z;
    }
    const cx = (aabb.minX + aabb.maxX) / 2;
    const cy = (aabb.minY + aabb.maxY) / 2;
    const cz = aabb.maxZ - 0.5;
    const r = Math.min(aabb.maxX - aabb.minX, aabb.maxY - aabb.minY) * 0.2;
    const loop3d = [
      { x: cx - r, y: cy - r, z: cz },
      { x: cx + r, y: cy - r, z: cz },
      { x: cx + r, y: cy + r, z: cz },
      { x: cx - r, y: cy + r, z: cz }
    ];
    const trimmed = await backend.trimAsync(mesh, {
      boundary: loop3d.map((p) => ({ x: p.x, y: p.y })),
      loop3d,
      keepMode: 'KEEP_OUTSIDE',
      algorithm: 'vtk-select-polydata',
      role: 'preview',
      revision: 2,
      id: 8
    });
    const t = backend.getLastTransport();
    expect(t.deliveryMode).toBe('node-host');
    expect(t.resultFormat).toBe('binary');
    expect(t.jsonBytes ?? 0).toBe(0);
    expect(t.binaryBytes ?? 0).toBeGreaterThan(0);
    expect(trimmed.mesh.fingerprint).not.toBe(mesh.fingerprint);
    expect(trimmed.warnings.some((w) => w.includes('deliveryMode=node-host'))).toBe(true);

    const session = backend.getSession(mesh.objectId);
    expect(session?.previewId).toBeTruthy();
    const previewId = String(session!.previewId);
    expect(backend.getCachedPreview(previewId)?.previewFingerprint).toBe(trimmed.mesh.fingerprint);

    await backend.cancelWorkerPreview({ objectId: mesh.objectId, previewId });
    expect(backend.getCachedPreview(previewId)).toBeUndefined();

    // HTTP fallback still works when forced.
    setGeometryDeliveryClientForTests(new HttpGeometryDeliveryClient());
    const backendHttp = new VtkHttpWorkerBackend();
    await backendHttp.ensureGeometry(mesh, { caseId: 'geo-001h-http', force: true });
    const trimmedHttp = await backendHttp.trimAsync(mesh, {
      boundary: loop3d.map((p) => ({ x: p.x, y: p.y })),
      loop3d,
      keepMode: 'KEEP_OUTSIDE',
      algorithm: 'vtk-select-polydata',
      role: 'preview',
      revision: 3,
      id: 9
    });
    const th = backendHttp.getLastTransport();
    expect(th.deliveryMode).toBe('http-fallback');
    expect(th.resultFormat).toBe('binary');
    expect(trimmedHttp.mesh.fingerprint).not.toBe(mesh.fingerprint);
  }, 120_000);

  it('times node-host real dental trim when fixtures + worker available', async () => {
    if (!(await probeVtkHttpWorker())) return;

    setGeometryDeliveryClientForTests(new NodeHostGeometryDeliveryClient());
    const root = join(fileURLToPath(new URL('../../..', import.meta.url)));
    const buf = readFileSync(join(root, 'public/clinical-fixtures/upper.stl'));
    const parsed = parseClinicalMeshBytes(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      'stl'
    );
    const raw = createMesh({
      id: 1,
      objectId: 'upper-h-timed',
      role: 'working',
      revision: 1,
      positions: parsed.positions,
      indices: parsed.indices,
      fingerprint: fingerprintMesh(parsed.positions, parsed.indices)
    });
    const mesh = normalizeMeshTopology(raw).mesh;
    const backend = new VtkHttpWorkerBackend();
    const tEnsure = performance.now();
    await backend.ensureGeometry(mesh, { caseId: 'h-timed' });
    const ensureMs = performance.now() - tEnsure;

    const pos = mesh.positions;
    let maxX = -1e9;
    let maxXi = 0;
    for (let i = 0; i < pos.length / 3; i += 1) {
      if (pos[i * 3]! > maxX) {
        maxX = pos[i * 3]!;
        maxXi = i;
      }
    }
    const b = [pos[maxXi * 3]!, pos[maxXi * 3 + 1]!, pos[maxXi * 3 + 2]!] as const;
    const seeds = [
      { point: [b[0] - 2, b[1] - 2, b[2]] as const },
      { point: [b[0] + 2, b[1] - 2, b[2]] as const },
      { point: [b[0] + 2, b[1] + 2, b[2]] as const },
      { point: [b[0] - 2, b[1] + 2, b[2]] as const }
    ];
    const built = createSurfacePath(mesh, seeds, {
      closed: false,
      reconstruct: 'never',
      maxProjectDistanceMm: 12
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const closed = closeSurfacePath(mesh, built.path, { maxJumpMm: 40 });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    const loop3d = thinSurfacePath(closed.path, 1, 64).samples.map((s) => ({
      x: s.point[0],
      y: s.point[1],
      z: s.point[2]
    }));
    const opts = {
      boundary: loop3d.map((p) => ({ x: p.x, y: p.y })),
      loop3d,
      keepMode: 'KEEP_OUTSIDE' as const,
      algorithm: 'vtk-select-polydata' as const,
      role: 'preview' as const,
      revision: 2,
      id: 2
    };
    const t0 = performance.now();
    const a = await backend.trimAsync(mesh, opts);
    const nodeMs = performance.now() - t0;
    const transport = backend.getLastTransport();
    console.log(
      JSON.stringify({
        ensureMs,
        nodeMs,
        fp: a.mesh.fingerprint,
        faces: a.mesh.indices.length / 3,
        transport
      })
    );
    expect(transport.deliveryMode).toBe('node-host');
    expect(transport.resultFormat).toBe('binary');
    // Host-side delivery should be in the same order as computation (~seconds), not ~35s Chromium HTTP.
    expect(nodeMs).toBeLessThan(25_000);
  }, 300_000);
});
