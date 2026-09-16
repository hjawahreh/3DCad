/**
 * GEO-001F — Persistent geometry worker session + no full-mesh repeat Trim.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMesh,
  fingerprintMesh,
  normalizeMeshTopology,
  createSurfacePath,
  closeSurfacePath,
  thinSurfacePath,
  VtkHttpWorkerBackend,
  probeVtkHttpWorker
} from '../../../src/geometry-kernel/index.js';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const upperStl = join(root, 'public/clinical-fixtures/upper.stl');

const openBowl = (res = 16, id = 1) => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= res; y += 1) {
    for (let x = 0; x <= res; x += 1) {
      const u = x / res;
      const v = y / res;
      positions.push((u - 0.5) * 40, (v - 0.5) * 40, Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 4);
    }
  }
  for (let y = 0; y < res; y += 1) {
    for (let x = 0; x < res; x += 1) {
      const i = y * (res + 1) + x;
      indices.push(i, i + 1, i + res + 1, i + 1, i + res + 2, i + res + 1);
    }
  }
  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return createMesh({
    id,
    objectId: `bowl-${id}`,
    role: 'working',
    revision: 1,
    positions: pos,
    indices: idx,
    fingerprint: fingerprintMesh(pos, idx)
  });
};

const loadNormalizedUpper = () => {
  const buf = readFileSync(upperStl);
  const parsed = parseClinicalMeshBytes(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    'stl'
  );
  const raw = createMesh({
    id: 701,
    objectId: 'upper-001f',
    role: 'working',
    revision: 1,
    positions: parsed.positions,
    indices: parsed.indices,
    fingerprint: fingerprintMesh(parsed.positions, parsed.indices)
  });
  return normalizeMeshTopology(raw).mesh;
};

const loopAround = (r = 6) => [
  { x: -r, y: -r, z: 2 },
  { x: r, y: -r, z: 2 },
  { x: r, y: r, z: 2 },
  { x: -r, y: r, z: 2 }
];

describe('GEO-001F persistent worker session', () => {
  let vtkOk = false;
  const backend = new VtkHttpWorkerBackend();

  beforeAll(async () => {
    vtkOk = await probeVtkHttpWorker();
  }, 10_000);

  it('initializes worker geometry once and returns session identity', async () => {
    if (!vtkOk) return;
    const mesh = openBowl(12, 11);
    const info = await backend.ensureGeometry(mesh, { caseId: 'geo-001f' });
    expect(info.workerSessionId.length).toBeGreaterThan(4);
    expect(info.geometryFingerprint).toBe(mesh.fingerprint);
    expect(info.objectId).toBe(mesh.objectId);
    expect(info.meshResident).toBe(true);
    expect(info.lastUploadBytes).toBeGreaterThan(100);
    const again = await backend.ensureGeometry(mesh, { caseId: 'geo-001f' });
    expect(again.workerSessionId).toBe(info.workerSessionId);
    expect(again.lastUploadBytes).toBe(info.lastUploadBytes);
  }, 60_000);

  it('repeat Trim does not re-upload full mesh (meshResident, uploadBytes≈0)', async () => {
    if (!vtkOk) return;
    const mesh = openBowl(14, 12);
    await backend.ensureGeometry(mesh, { caseId: 'geo-001f-b' });
    const seeds = loopAround(7).map((p) => ({ point: [p.x, p.y, p.z] as const }));
    const built = createSurfacePath(mesh, seeds, { closed: false, reconstruct: 'gaps' });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const closed = closeSurfacePath(mesh, built.path);
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    const thinned = thinSurfacePath(closed.path, 1.0, 64);
    const loop3d = thinned.samples.map((s) => ({
      x: s.point[0],
      y: s.point[1],
      z: s.point[2]
    }));

    const mkOpts = (loop3d: { x: number; y: number; z: number }[], id: number) => ({
      boundary: loop3d.map((p) => ({ x: p.x, y: p.y })),
      loop3d,
      keepMode: 'KEEP_OUTSIDE' as const,
      algorithm: 'vtk-select-polydata' as const,
      role: 'preview' as const,
      revision: id,
      id
    });

    const a = await backend.trimAsync(mesh, mkOpts(loop3d, 9001));
    expect(a.mesh.fingerprint).not.toBe(mesh.fingerprint);
    const transportA = backend.getLastTransport();
    expect(transportA.meshResident || transportA.uploadBytes === 0).toBe(true);

    const b = await backend.trimAsync(
      mesh,
      mkOpts(
        loop3d.map((p) => ({ x: p.x * 0.9, y: p.y * 0.9, z: p.z })),
        9002
      )
    );
    expect(b.mesh.fingerprint).not.toBe(mesh.fingerprint);
    const transportB = backend.getLastTransport();
    expect(transportB.meshUploaded).toBe(false);
    expect(transportB.uploadBytes).toBe(0);
    expect(transportB.meshResident).toBe(true);
    expect(a.warnings.some((w) => w.includes('meta:meshResident=true') || w.includes('uploadBytes=0'))).toBe(
      true
    );
  }, 120_000);

  it('preview cancel + accept promote without recomputing on accept path', async () => {
    if (!vtkOk) return;
    const mesh = openBowl(18, 13);
    await backend.ensureGeometry(mesh, { caseId: 'geo-001f-c' });
    const seeds = loopAround(8).map((p) => ({ point: [p.x, p.y, p.z] as const }));
    const built = createSurfacePath(mesh, seeds, {
      closed: false,
      reconstruct: 'gaps',
      maxTotalSamples: 64
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const closed = closeSurfacePath(mesh, built.path);
    if (!closed.ok) return;
    const loop3d = thinSurfacePath(closed.path, 1.0, 48).samples.map((s) => ({
      x: s.point[0],
      y: s.point[1],
      z: s.point[2]
    }));
    const mkOpts = (scale: number, id: number) => ({
      boundary: loop3d.map((p) => ({ x: p.x * scale, y: p.y * scale })),
      loop3d: loop3d.map((p) => ({ x: p.x * scale, y: p.y * scale, z: p.z })),
      keepMode: 'KEEP_OUTSIDE' as const,
      algorithm: 'vtk-select-polydata' as const,
      role: 'preview' as const,
      revision: id,
      id
    });
    const first = await backend.trimAsync(mesh, mkOpts(1, 9010));
    expect(first.mesh.fingerprint).not.toBe(mesh.fingerprint);
    const session = backend.getSession(mesh.objectId);
    expect(session?.previewId).toBeDefined();
    await backend.cancelWorkerPreview({
      objectId: mesh.objectId,
      ...(session?.previewId !== undefined ? { previewId: session.previewId } : {})
    });
    expect(backend.getSession(mesh.objectId)?.geometryFingerprint).toBe(mesh.fingerprint);

    const preview2 = await backend.trimAsync(mesh, mkOpts(0.85, 9011));
    const sid = backend.getSession(mesh.objectId);
    expect(sid?.previewId).toBeDefined();
    const promoted = await backend.acceptWorkerPreview({
      objectId: mesh.objectId,
      previewId: sid!.previewId!,
      expectedBaseFingerprint: mesh.fingerprint,
      promotedFingerprint: preview2.mesh.fingerprint
    });
    expect(promoted.geometryFingerprint).toBe(preview2.mesh.fingerprint);
    expect(promoted.workerSessionId).not.toBe(sid!.workerSessionId);
  }, 120_000);

  it('worker session mismatch returns WORKER_SESSION_INVALID (recoverable)', async () => {
    if (!vtkOk) return;
    const res = await fetch('http://127.0.0.1:8765/v1/geometry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'trim',
        worker_session_id: 'ws-does-not-exist',
        geometry_fingerprint: 'geo:deadbeef',
        loop: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0]
        ],
        normal: [0, 0, 1],
        inside_out: false,
        include_mesh: false,
        store_preview: false
      })
    });
    const parsed = (await res.json()) as { ok?: boolean; code?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('WORKER_SESSION_INVALID');
  }, 30_000);

  it('upper/lower isolation: independent sessions by objectId', async () => {
    if (!vtkOk) return;
    const upper = openBowl(8, 21);
    const lower = createMesh({
      ...openBowl(8, 22),
      objectId: 'lower-arch',
      id: 22
    });
    const u = await backend.ensureGeometry(upper, { caseId: 'case-ab' });
    const l = await backend.ensureGeometry(lower, { caseId: 'case-ab' });
    expect(u.workerSessionId).not.toBe(l.workerSessionId);
    expect(u.objectId).toBe(upper.objectId);
    expect(l.objectId).toBe(lower.objectId);
  }, 60_000);
});

describe('GEO-001F SurfacePath bounded densify', () => {
  it('maxTotalSamples keeps path ≤ bound on polyline reconstruct', () => {
    const mesh = openBowl(20, 30);
    const ring: { point: readonly [number, number, number] }[] = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ring.push({ point: [Math.cos(a) * 10, Math.sin(a) * 10, 1] });
    }
    const unbounded = createSurfacePath(mesh, ring, {
      closed: true,
      reconstruct: 'always'
    });
    const bounded = createSurfacePath(mesh, ring, {
      closed: true,
      reconstruct: 'always',
      maxTotalSamples: 64
    });
    expect(bounded.ok).toBe(true);
    if (!bounded.ok || !unbounded.ok) return;
    expect(bounded.path.samples.length).toBeLessThanOrEqual(128);
    expect(bounded.path.samples.length).toBeLessThanOrEqual(unbounded.path.samples.length);
  });
});

describe('GEO-001F real dental init (optional timing)', () => {
  it('initializes normalized upper once when VTK is up', async () => {
    if (!existsSync(upperStl)) return;
    const ok = await probeVtkHttpWorker();
    if (!ok) return;
    const mesh = loadNormalizedUpper();
    const backend = new VtkHttpWorkerBackend();
    const t0 = performance.now();
    const info = await backend.ensureGeometry(mesh, { caseId: 'geo-001f-real' });
    const initMs = performance.now() - t0;
    expect(info.meshResident).toBe(true);
    expect(info.lastUploadBytes).toBeGreaterThan(1_000_000);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ initMs, uploadBytes: info.lastUploadBytes, fp: info.geometryFingerprint }));
    const t1 = performance.now();
    await backend.ensureGeometry(mesh, { caseId: 'geo-001f-real' });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ensureHitMs: performance.now() - t1 }));
  }, 180_000);
});
