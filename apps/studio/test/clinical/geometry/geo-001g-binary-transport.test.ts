/**
 * GEO-001G — binary geometry frame encode/decode + worker transport.
 */
import { describe, expect, it } from 'vitest';
import {
  CGF_MAGIC,
  CGF_VERSION,
  createMesh,
  decodeBinaryGeometryFrame,
  encodeBinaryGeometryFrame,
  fingerprintMesh,
  GeometryKernelError,
  isBinaryGeometryFrame,
  probeVtkHttpWorker,
  VtkHttpWorkerBackend
} from '../../../src/geometry-kernel/index.js';
import { buildSyntheticDentalSurface } from '../../../src/geometry-kernel/mesh/MeshRegistry.js';

describe('GEO-001G binary geometry frame', () => {
  it('encodes and decodes Float32/Uint32 without changing fingerprint', () => {
    const synth = buildSyntheticDentalSurface('cgf-roundtrip', 1);
    const encoded = encodeBinaryGeometryFrame(synth.positions, synth.indices, {
      geometryFingerprint: synth.fingerprint,
      previewId: 'pv-test',
      baseFingerprint: synth.fingerprint
    });
    expect(encoded.byteLength).toBeGreaterThan(64);
    expect(encoded.binaryBytes).toBe(
      synth.positions.byteLength + synth.indices.byteLength
    );
    expect(isBinaryGeometryFrame(encoded.buffer)).toBe(true);

    const decoded = decodeBinaryGeometryFrame(encoded.buffer);
    expect(decoded.version).toBe(CGF_VERSION);
    expect(decoded.vertexCount).toBe(synth.positions.length / 3);
    expect(decoded.indexCount).toBe(synth.indices.length);
    expect(decoded.meta.previewId).toBe('pv-test');
    expect(fingerprintMesh(decoded.positions, decoded.indices)).toBe(synth.fingerprint);
    expect(decoded.positions.length).toBe(synth.positions.length);
    expect(decoded.indices.length).toBe(synth.indices.length);
    for (let i = 0; i < 12; i += 1) {
      expect(decoded.positions[i]).toBe(synth.positions[i]);
      expect(decoded.indices[i]).toBe(synth.indices[i]);
    }
  });

  it('rejects bad magic / version / truncation', () => {
    const badMagic = new ArrayBuffer(64);
    new DataView(badMagic).setUint32(0, 0xdeadbeef, false);
    expect(() => decodeBinaryGeometryFrame(badMagic)).toThrow(GeometryKernelError);
    try {
      decodeBinaryGeometryFrame(badMagic);
    } catch (err) {
      expect((err as GeometryKernelError).code).toBe('BINARY_GEOMETRY_INVALID');
    }

    const encoded = encodeBinaryGeometryFrame(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      new Uint32Array([0, 1, 2]),
      {}
    );
    const view = new DataView(encoded.buffer.slice(0));
    view.setUint16(4, 99, true);
    expect(() => decodeBinaryGeometryFrame(view.buffer)).toThrow(/VERSION_UNSUPPORTED|unsupported/i);

    expect(() => decodeBinaryGeometryFrame(encoded.buffer.slice(0, 20))).toThrow(
      /TRUNCATED|truncated|shorter than header/i
    );
  });

  it('does not use JSON number arrays for mesh payload size', () => {
    const positions = new Float32Array(3000);
    const indices = new Uint32Array(3000);
    for (let i = 0; i < positions.length; i += 1) positions[i] = i * 0.01;
    for (let i = 0; i < indices.length; i += 1) indices[i] = i % 900;
    const encoded = encodeBinaryGeometryFrame(positions, indices, { ok: true });
    const asJson = JSON.stringify({
      positions: [...positions],
      indices: [...indices]
    });
    expect(encoded.byteLength).toBeLessThan(asJson.length / 2);
    expect(encoded.metaBytes).toBeLessThan(64);
  });
});

describe('GEO-001G worker binary trim (optional)', () => {
  it('returns binary frame with uploadBytes=0 on resident trim', async () => {
    if (!(await probeVtkHttpWorker())) {
      console.warn('VTK worker unavailable — skipping GEO-001G live trim');
      return;
    }
    const synth = buildSyntheticDentalSurface(`cgf-live-${Date.now()}`, 42);
    // Enlarge slightly so clip removes something: use a small planar loop on top.
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
    await backend.ensureGeometry(mesh, { caseId: 'geo-001g' });
    const initTransport = backend.getLastTransport();
    expect(initTransport.uploadBytes).toBeGreaterThan(0);

    const aabb = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity
    };
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!;
      const y = mesh.positions[i + 1]!;
      const z = mesh.positions[i + 2]!;
      if (x < aabb.minX) aabb.minX = x;
      if (x > aabb.maxX) aabb.maxX = x;
      if (y < aabb.minY) aabb.minY = y;
      if (y > aabb.maxY) aabb.maxY = y;
      if (z < aabb.minZ) aabb.minZ = z;
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
      id: 43
    });
    const t = backend.getLastTransport();
    expect(t.uploadBytes).toBe(0);
    expect(t.meshResident).toBe(true);
    expect(t.resultFormat).toBe('binary');
    expect(t.jsonBytes ?? 0).toBe(0);
    expect(t.binaryBytes ?? 0).toBeGreaterThan(0);
    expect(t.downloadBytes).toBeLessThan((t.binaryBytes ?? 0) * 1.5 + 4096);
    expect(trimmed.mesh.fingerprint).not.toBe(mesh.fingerprint);
    expect(trimmed.warnings.some((w) => w.includes('resultFormat=binary'))).toBe(true);

    const session = backend.getSession(mesh.objectId);
    expect(session?.previewId).toBeTruthy();
    const previewId = String(session!.previewId);
    const cached = backend.getCachedPreview(previewId);
    expect(cached?.previewFingerprint).toBe(trimmed.mesh.fingerprint);

    await backend.cancelWorkerPreview({
      objectId: mesh.objectId,
      previewId
    });
    expect(backend.getCachedPreview(previewId)).toBeUndefined();

    // Second preview — still binary, still no upload.
    const trimmed2 = await backend.trimAsync(mesh, {
      boundary: loop3d.map((p) => ({ x: p.x, y: p.y })),
      loop3d: loop3d.map((p) => ({ x: p.x * 0.98, y: p.y * 0.98, z: p.z })),
      keepMode: 'KEEP_OUTSIDE',
      algorithm: 'vtk-select-polydata',
      role: 'preview',
      revision: 3,
      id: 44
    });
    const t2 = backend.getLastTransport();
    expect(t2.uploadBytes).toBe(0);
    expect(t2.resultFormat).toBe('binary');
    expect(trimmed2.mesh.fingerprint).not.toBe(mesh.fingerprint);

    const sid = backend.getSession(mesh.objectId)?.previewId;
    expect(sid).toBeTruthy();
    await backend.acceptWorkerPreview({
      objectId: mesh.objectId,
      previewId: String(sid),
      expectedBaseFingerprint: mesh.fingerprint,
      promotedFingerprint: trimmed2.mesh.fingerprint
    });
    expect(backend.getSession(mesh.objectId)?.geometryFingerprint).toBe(
      trimmed2.mesh.fingerprint
    );
  }, 120_000);
});

describe('GEO-001G magic constant', () => {
  it('exports CGF_MAGIC as CGF1', () => {
    expect(CGF_MAGIC).toBe(0x43474631);
  });
});
