/**
 * PROD-002R — vtkSelectPolyData primary trim pipeline + ImplicitSelectionLoop fallback.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createMesh,
  fingerprintMesh,
  normalizeTrimKeepMode
} from '../../../src/geometry-kernel/index.js';
import {
  VtkNativeWorkerBackend,
  isVtkNativeWorkerAvailable
} from '../../../src/geometry-kernel/adapters/VtkNativeWorkerBackend.js';
import { HybridGeometryBackend } from '../../../src/geometry-kernel/adapters/HybridGeometryBackend.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const python = process.env.CAD_VTK_PYTHON ?? '/tmp/cad-geom-bench/bin/python';
const script = join(root, 'tools/geometry-backend-bench/vtk_clinical_spike.py');

const workerReady = (): boolean =>
  existsSync(python) && existsSync(script) && isVtkNativeWorkerAvailable({ pythonPath: python, scriptPath: script });

/** N×N vertex grid on z=0 → 2*(N-1)² triangles. */
const buildPlanarGridMesh = (n = 12) => {
  const positions = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const idx = (j * n + i) * 3;
      positions[idx] = i;
      positions[idx + 1] = j;
      positions[idx + 2] = 0;
    }
  }
  const triCount = (n - 1) * (n - 1) * 2;
  const indices = new Uint32Array(triCount * 3);
  let t = 0;
  for (let j = 0; j < n - 1; j += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[t++] = a;
      indices[t++] = b;
      indices[t++] = c;
      indices[t++] = b;
      indices[t++] = d;
      indices[t++] = c;
    }
  }
  return createMesh({
    id: 1,
    objectId: 'grid',
    role: 'working',
    revision: 1,
    positions,
    indices,
    fingerprint: fingerprintMesh(positions, indices)
  });
};

const writeGridStl = (mesh: ReturnType<typeof buildPlanarGridMesh>, dir: string): string => {
  const triCount = Math.floor(mesh.indices.length / 3);
  const buf = Buffer.alloc(84 + triCount * 50);
  buf.write('PROD002R grid', 0, 'ascii');
  buf.writeUInt32LE(triCount, 80);
  let offset = 84;
  for (let t = 0; t < triCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    const ax = mesh.positions[i0 * 3]!;
    const ay = mesh.positions[i0 * 3 + 1]!;
    const az = mesh.positions[i0 * 3 + 2]!;
    const bx = mesh.positions[i1 * 3]!;
    const by = mesh.positions[i1 * 3 + 1]!;
    const bz = mesh.positions[i1 * 3 + 2]!;
    const cx = mesh.positions[i2 * 3]!;
    const cy = mesh.positions[i2 * 3 + 1]!;
    const cz = mesh.positions[i2 * 3 + 2]!;
    buf.writeFloatLE(0, offset);
    buf.writeFloatLE(0, offset + 4);
    buf.writeFloatLE(0, offset + 8);
    buf.writeFloatLE(ax, offset + 12);
    buf.writeFloatLE(ay, offset + 16);
    buf.writeFloatLE(az, offset + 20);
    buf.writeFloatLE(bx, offset + 24);
    buf.writeFloatLE(by, offset + 28);
    buf.writeFloatLE(bz, offset + 32);
    buf.writeFloatLE(cx, offset + 36);
    buf.writeFloatLE(cy, offset + 40);
    buf.writeFloatLE(cz, offset + 44);
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }
  const path = join(dir, 'grid.stl');
  writeFileSync(path, buf);
  return path;
};

const runSpikeTrim = (req: Record<string, unknown>): Record<string, unknown> => {
  const spawned = spawnSync(python, [script, '--stdin-json'], {
    input: JSON.stringify(req),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000
  });
  expect(spawned.status).toBe(0);
  return JSON.parse(spawned.stdout) as Record<string, unknown>;
};

describe('PROD-002R hybrid routing', () => {
  it('accepts vtk-select-polydata alongside vtk-implicit-loop for loop3d async path', async () => {
    const hybrid = new HybridGeometryBackend();
    hybrid.setVtkHealthy(true);
    const mesh = buildPlanarGridMesh(6);
    await expect(
      hybrid.trimAsync(mesh, {
        boundary: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 }
        ],
        loop3d: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 }
        ],
        algorithm: 'vtk-select-polydata'
      })
    ).rejects.toThrow(/VTK worker unreachable|Trim produced/);
  });

  it('maps remove-interior to KEEP_OUTSIDE', () => {
    expect(normalizeTrimKeepMode('remove-interior')).toBe('KEEP_OUTSIDE');
    expect(normalizeTrimKeepMode('KEEP_INSIDE')).toBe('KEEP_INSIDE');
  });
});

describe.runIf(workerReady())('PROD-002R vtkSelectPolyData trim (planar grid)', () => {
  const grid = buildPlanarGridMesh(12);
  const inputTris = Math.floor(grid.indices.length / 3);
  const normal: [number, number, number] = [0, 0, 1];
  const convexLoop = [
    [3, 3, 0],
    [8, 3, 0],
    [8, 8, 0],
    [3, 8, 0]
  ];
  const concaveLoop = [
    [2, 2, 0],
    [9, 2, 0],
    [9, 4, 0],
    [5, 4, 0],
    [5, 9, 0],
    [2, 9, 0]
  ];
  const outsideLoop = [
    [-3, -3, 0],
    [-1, -3, 0],
    [-1, -1, 0],
    [-3, -1, 0]
  ];

  let tmpDir: string;
  let gridStl: string;

  it('prepares grid fixture STL', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'prod-002r-'));
    gridStl = writeGridStl(grid, tmpDir);
    expect(existsSync(gridStl)).toBe(true);
  });

  it('convex loop removes interior (KEEP_OUTSIDE)', () => {
    const res = runSpikeTrim({
      cmd: 'trim',
      mesh_path: gridStl,
      loop: convexLoop,
      normal,
      inside_out: false,
      include_mesh: false
    });
    expect(res.ok).toBe(true);
    const diagnostics = res.diagnostics as { pipeline?: string };
    expect(String(diagnostics?.pipeline)).toContain('SelectPolyData');
    expect(Number(res.removed_triangle_count ?? res.removed_triangles_est)).toBeGreaterThan(0);
    expect(Number(res.output_triangle_count ?? res.output_triangles)).toBeLessThan(inputTris);
    expect(res.noop).toBe(false);
    expect(res.keep_mode).toBe('KEEP_OUTSIDE');
  });

  it('concave L-loop removes interior with triangle delta > 0', () => {
    const res = runSpikeTrim({
      cmd: 'trim',
      mesh_path: gridStl,
      loop: concaveLoop,
      normal,
      inside_out: false,
      include_mesh: false
    });
    expect(res.ok).toBe(true);
    expect(Number(res.removed_triangle_count ?? res.removed_triangles_est)).toBeGreaterThan(0);
    expect(Number(res.output_triangle_count ?? res.output_triangles)).toBeLessThan(inputTris);
  });

  it('loop outside mesh is a true no-op', () => {
    const res = runSpikeTrim({
      cmd: 'trim',
      mesh_path: gridStl,
      loop: outsideLoop,
      normal,
      inside_out: false,
      include_mesh: false
    });
    expect(res.ok).toBe(false);
    expect(res.noop).toBe(true);
    expect(String(res.error)).toMatch(/no geometry change/i);
    expect(Number(res.output_triangle_count ?? res.output_triangles ?? inputTris)).toBe(inputTris);
  });

  it('KEEP_INSIDE retains fewer triangles than KEEP_OUTSIDE on same loop', () => {
    const keepOut = runSpikeTrim({
      cmd: 'trim',
      mesh_path: gridStl,
      loop: convexLoop,
      normal,
      inside_out: false,
      include_mesh: false
    });
    const keepIn = runSpikeTrim({
      cmd: 'trim',
      mesh_path: gridStl,
      loop: convexLoop,
      normal,
      inside_out: true,
      include_mesh: false
    });
    expect(keepOut.ok).toBe(true);
    expect(keepIn.ok).toBe(true);
    expect(Number(keepIn.output_triangle_count ?? keepIn.output_triangles)).toBeLessThan(
      Number(keepOut.output_triangle_count ?? keepOut.output_triangles)
    );
    expect(keepIn.keep_mode).toBe('KEEP_INSIDE');
  });

  it('returns rich diagnostics without mesh buffers when include_mesh=false', () => {
    const res = runSpikeTrim({
      cmd: 'trim',
      mesh_path: gridStl,
      loop: convexLoop,
      normal,
      inside_out: false,
      include_mesh: false
    });
    expect(res.ok).toBe(true);
    expect(res.validation ?? res.quality).toBeDefined();
    expect(Array.isArray(res.bounds_before)).toBe(true);
    expect(res.bounds_after).toBeDefined();
    expect(Number(res.surface_area_before)).toBeGreaterThan(0);
    expect(Number(res.surface_area_after)).toBeGreaterThan(0);
    expect(Number(res.new_point_count ?? res.vertices)).toBeGreaterThan(0);
  });

  it('VtkNativeWorkerBackend uses vtk-select-polydata on grid trim', () => {
    const backend = new VtkNativeWorkerBackend({ pythonPath: python, scriptPath: script });
    const result = backend.trim(grid, {
      boundary: convexLoop.map(([x, y]) => ({ x: x as number, y: y as number })),
      loop3d: convexLoop.map(([x, y, z]) => ({
        x: x as number,
        y: y as number,
        z: z as number
      })),
      loopNormal: normal,
      keepMode: 'KEEP_OUTSIDE',
      algorithm: 'vtk-select-polydata'
    });
    expect(result.algorithm).toBe('vtk-select-polydata');
    expect(result.removedTriangles).toBeGreaterThan(0);
    expect(result.keptTriangles).toBeLessThan(inputTris);
    expect(result.warnings.some((w) => w.includes('SelectPolyData'))).toBe(true);
  });

  it('cleans temp fixture', () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
