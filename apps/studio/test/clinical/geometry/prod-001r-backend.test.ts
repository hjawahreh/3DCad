/**
 * PROD-001R — backend policy, adapters, and fixture regression corpus gates.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClinicalGeometryKernelBridge,
  CLOSE_BASE_MAX_ADDED_TRIANGLES,
  createMesh,
  fingerprintMesh,
  GEOMETRY_BACKEND_POLICY,
  isPrototypeAlgorithmAllowed,
  ManifoldWasmAdapter,
  NativeReferenceBackend,
  Open3DAdapter,
  trimMesh,
  inferTrimProjectionAxes,
  VtkClipAdapter,
  tryCreateManifoldSolid,
  injectManifoldModuleForTests
} from '../../../src/geometry-kernel/index.js';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';
import { GeometryKernelError } from '../../../src/geometry-kernel/errors.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../public/clinical-fixtures'
);

const loadDecimated = (fileName: string, targetFaces = 4000) => {
  const file = readFileSync(join(fixturesDir, fileName));
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const parsed = parseClinicalMeshBytes(bytes, 'stl');
  const stride = Math.max(1, Math.floor(parsed.faceCount / targetFaces));
  const idx: number[] = [];
  for (let t = 0; t < parsed.faceCount; t += stride) {
    idx.push(
      parsed.indices[t * 3]!,
      parsed.indices[t * 3 + 1]!,
      parsed.indices[t * 3 + 2]!
    );
  }
  return createMesh({
    id: 1,
    objectId: fileName,
    role: 'working',
    revision: 1,
    positions: parsed.positions,
    indices: new Uint32Array(idx),
    fingerprint: fingerprintMesh(parsed.positions, new Uint32Array(idx))
  });
};

const uvRect = (mesh: ReturnType<typeof loadDecimated>, scale = 0.2) => {
  const axes = inferTrimProjectionAxes(mesh);
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  const n = Math.floor(mesh.positions.length / 3);
  for (let i = 0; i < n; i += 1) {
    const u = mesh.positions[i * 3 + axes.u]!;
    const v = mesh.positions[i * 3 + axes.v]!;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const cu = 0.5 * (minU + maxU);
  const cv = 0.5 * (minV + maxV);
  const su = (maxU - minU) * scale;
  const sv = (maxV - minV) * scale;
  return [
    { x: cu - su, y: cv - sv },
    { x: cu + su, y: cv - sv },
    { x: cu + su, y: cv + sv },
    { x: cu - su, y: cv + sv }
  ];
};

describe('PROD-001R geometry backend policy', () => {
  it('documents hybrid roles and disables prototype algorithms by default', () => {
    const ids = GEOMETRY_BACKEND_POLICY.map((d) => d.id);
    expect(ids).toContain('clinical-reference-v1');
    expect(ids).toContain('vtk-clip-polydata');
    expect(ids).toContain('manifold-3d');
    expect(ids).toContain('trim.centroid-polygon');

    const browser = GEOMETRY_BACKEND_POLICY.find((d) => d.id === 'clinical-reference-v1');
    expect(browser?.productionEnabled).toBe(true);
    expect(browser?.role).toBe('authoritative-browser');

    expect(isPrototypeAlgorithmAllowed('trim.centroid-polygon')).toBe(false);
    expect(isPrototypeAlgorithmAllowed('close-base.unbounded-aabb-extrude')).toBe(false);

    const vtk = GEOMETRY_BACKEND_POLICY.find((d) => d.id === 'vtk-clip-polydata');
    expect(vtk?.productionEnabled).toBe(false);
    expect(vtk?.role).toBe('specialized-clipping');
  });

  it('keeps scaffold adapters behind GeometryBackend without leaking success on open scans', () => {
    const mesh = createMesh({
      id: 1,
      objectId: 'tiny',
      role: 'working',
      revision: 1,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      fingerprint: 'geo:test'
    });
    const boundary = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 }
    ];

    expect(() => new VtkClipAdapter().trim(mesh, { boundary })).toThrow(GeometryKernelError);
    expect(() => new Open3DAdapter().trim(mesh, { boundary })).toThrow(GeometryKernelError);
    expect(() => new ManifoldWasmAdapter().trim(mesh, { boundary })).toThrow(/manifold-3d module not loaded|Manifold/);

    injectManifoldModuleForTests(null);
    const probe = tryCreateManifoldSolid(mesh);
    expect(probe.ok).toBe(false);
  });

  it('ClinicalGeometryKernelBridge accepts injectable GeometryBackend', () => {
    const backend = new NativeReferenceBackend();
    const bridge = new ClinicalGeometryKernelBridge(undefined, undefined, undefined, backend);
    expect(bridge.backend.name).toBe('clinical-reference-v1');
  });
});

describe('PROD-001R regression corpus (decimated real fixtures)', () => {
  it(
    'trim no-change case is rejected',
    () => {
      const m = loadDecimated('upper.stl');
      expect(() =>
        trimMesh(m, {
          boundary: [
            { x: -1e6, y: -1e6 },
            { x: -1e6 + 1, y: -1e6 },
            { x: -1e6 + 0.5, y: -1e6 + 1 }
          ],
          role: 'working',
          revision: 2
        })
      ).toThrow(/no geometry change/i);
    },
    15_000
  );

  it(
    'exact trim on open upper scan changes fingerprint and face count',
    () => {
      const m = loadDecimated('upper.stl');
      const before = m.fingerprint;
      const beforeFaces = Math.floor(m.indices.length / 3);
      const result = trimMesh(m, {
        boundary: uvRect(m, 0.2),
        role: 'working',
        revision: 2,
        algorithm: 'exact-edge-clip'
      });
      expect(result.removedTriangles).toBeGreaterThan(0);
      expect(result.mesh.fingerprint).not.toBe(before);
      expect(Math.floor(result.mesh.indices.length / 3)).not.toBe(beforeFaces);
      expect(result.mesh.positions.every((n) => Number.isFinite(n))).toBe(true);
    },
    30_000
  );

  it(
    'close-base on open lower scan stays under triangle ceiling',
    () => {
    const m = loadDecimated('lower.stl');
    const closed = new NativeReferenceBackend().closeBase(m, {
      strategy: 'plane',
      height: 2,
      role: 'working',
      revision: 3,
      maxElapsedMs: 8000
    });
    expect(closed.addedTriangles).toBeGreaterThan(0);
    expect(closed.addedTriangles).toBeLessThanOrEqual(CLOSE_BASE_MAX_ADDED_TRIANGLES);
    expect(closed.mesh.positions.every((n) => Number.isFinite(n))).toBe(true);
    },
    60_000
  );

  it('upper trim then close-base remains finite and capped', () => {
    const m = loadDecimated('upper.stl');
    const trimmed = trimMesh(m, {
      boundary: uvRect(m, 0.2),
      role: 'working',
      revision: 2
    });
    expect(trimmed.removedTriangles).toBeGreaterThan(0);
    const closed = new NativeReferenceBackend().closeBase(trimmed.mesh, {
      strategy: 'plane',
      height: 2,
      role: 'working',
      revision: 3,
      maxElapsedMs: 8000
    });
    expect(closed.addedTriangles).toBeLessThanOrEqual(CLOSE_BASE_MAX_ADDED_TRIANGLES);
    expect(closed.mesh.positions.every((n) => Number.isFinite(n))).toBe(true);
  });
});
