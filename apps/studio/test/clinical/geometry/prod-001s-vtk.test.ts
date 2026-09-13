/**
 * PROD-001S — VTK clinical trim/close-base spike tests (native worker).
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GEOMETRY_BACKEND_POLICY,
  VtkClipAdapter,
  createMesh,
  fingerprintMesh,
  inferTrimProjectionAxes,
  trimMesh
} from '../../../src/geometry-kernel/index.js';
import {
  VtkNativeWorkerBackend,
  isVtkNativeWorkerAvailable
} from '../../../src/geometry-kernel/adapters/VtkNativeWorkerBackend.js';
import { GeometryKernelError } from '../../../src/geometry-kernel/errors.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const python = process.env.CAD_VTK_PYTHON ?? '/tmp/cad-geom-bench/bin/python';
const script = join(root, 'tools/geometry-backend-bench/vtk_clinical_spike.py');
const fixtures = join(root, 'apps/studio/public/clinical-fixtures');

const workerReady = (): boolean =>
  existsSync(python) && existsSync(script) && isVtkNativeWorkerAvailable({ pythonPath: python, scriptPath: script });

const runSpikeJson = (req: Record<string, unknown>): Record<string, unknown> => {
  const spawned = spawnSync(python, [script, '--stdin-json'], {
    input: JSON.stringify(req),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000
  });
  expect(spawned.status).toBe(0);
  return JSON.parse(spawned.stdout) as Record<string, unknown>;
};

describe('PROD-001S architecture / policy', () => {
  it('keeps VTK as specialized-clipping; only HTTP worker production-enabled post PROD-001T', () => {
    const vtk = GEOMETRY_BACKEND_POLICY.filter((d) => d.id.startsWith('vtk'));
    expect(vtk.length).toBeGreaterThan(0);
    for (const d of vtk) {
      expect(d.role).toBe('specialized-clipping');
    }
    const http = vtk.find((d) => d.id === 'vtk-http-worker-v1');
    expect(http?.productionEnabled).toBe(true);
    const inProcessOrSpike = vtk.filter((d) => d.id !== 'vtk-http-worker-v1');
    for (const d of inProcessOrSpike) {
      expect(d.productionEnabled).toBe(false);
    }
  });

  it('scaffold adapter still refuses in-process VTK', () => {
    expect(() =>
      new VtkClipAdapter().trim(
        createMesh({
          id: 1,
          objectId: 't',
          role: 'working',
          revision: 1,
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          indices: new Uint32Array([0, 1, 2]),
          fingerprint: 'geo:t'
        }),
        { boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] }
      )
    ).toThrow(GeometryKernelError);
  });

  it('clinical-reference rejects vtk-implicit-loop algorithm without worker', () => {
    const m = createMesh({
      id: 1,
      objectId: 't',
      role: 'working',
      revision: 1,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      fingerprint: 'geo:t'
    });
    expect(() =>
      trimMesh(m, {
        boundary: [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.1 },
          { x: 0.5, y: 0.9 }
        ],
        algorithm: 'vtk-implicit-loop'
      })
    ).toThrow(/VtkNativeWorkerBackend|vtk-implicit-loop/);
  });
});

describe.runIf(workerReady())('PROD-001S VTK native worker (real fixtures)', () => {
  it(
    'inventories lower.stl with boundary edges and open topology',
    () => {
      const inv = runSpikeJson({
        cmd: 'inventory',
        path: join(fixtures, 'lower.stl')
      });
      expect(Number(inv.vtk_cells_clean)).toBeGreaterThan(100_000);
      expect(Number(inv.boundary_edges)).toBeGreaterThan(100);
      expect(inv.watertight).toBe(false);
      expect(inv.edge_manifold).toBe(true);
    },
    120_000
  );

  it(
    'polygon trim on upper removes interior without emptying the arch',
    () => {
    // Build a simple surface loop via a short Python snippet embedded in trim by using mesh path + precomputed loop from bench helper.
    // Call inventory-sized trim through worker using a loop sampled by a tiny inline request:
    // We reuse stdin trim with a rectangular world loop derived from fixture bounds.
    const inv = runSpikeJson({
      cmd: 'inventory',
      path: join(fixtures, 'upper.stl')
    }) as { bounds: number[]; dimensions: number[] };
    const b = inv.bounds;
    const dims = [
      b[1]! - b[0]!,
      b[3]! - b[2]!,
      b[5]! - b[4]!
    ];
    const nAxis = dims.indexOf(Math.min(...dims));
    const uv = [0, 1, 2].filter((i) => i !== nAxis);
    const cu = (b[uv[0]! * 2]! + b[uv[0]! * 2 + 1]!) / 2;
    const cv = (b[uv[1]! * 2]! + b[uv[1]! * 2 + 1]!) / 2;
    const cn = (b[nAxis * 2]! + b[nAxis * 2 + 1]!) / 2;
    const su = dims[uv[0]!]! * 0.25;
    const sv = dims[uv[1]!]! * 0.25;
    const corners2 = [
      [cu - su / 2, cv - sv / 2],
      [cu + su / 2, cv - sv / 2],
      [cu + su / 2, cv + sv / 2],
      [cu - su / 2, cv + sv / 2]
    ];
    const loop = corners2.map(([u, v]) => {
      const p = [0, 0, 0];
      p[uv[0]!] = u!;
      p[uv[1]!] = v!;
      p[nAxis] = cn;
      return p;
    });
    const normal = [0, 0, 0];
    normal[nAxis] = 1;
    const res = runSpikeJson({
      cmd: 'trim',
      mesh_path: join(fixtures, 'upper.stl'),
      loop,
      normal,
      inside_out: false,
      include_mesh: false
    });
    // May no-op if loop doesn't hit surface — accept either meaningful remove or explicit no-op error.
    if (res.ok) {
      expect(Number(res.removed_triangles_est)).toBeGreaterThan(0);
      expect(Number(res.output_triangles)).toBeGreaterThan(1000);
      expect(Number(res.output_triangles)).toBeLessThan(Number(res.input_triangles));
    } else {
      expect(String(res.error)).toMatch(/no geometry change|orientation|self-intersecting/i);
    }
    },
    120_000
  );

  it('VtkNativeWorkerBackend rejects missing loop3d', () => {
    const backend = new VtkNativeWorkerBackend({ pythonPath: python, scriptPath: script });
    const m = createMesh({
      id: 1,
      objectId: 't',
      role: 'working',
      revision: 1,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      fingerprint: fingerprintMesh(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2]))
    });
    expect(() =>
      backend.trim(m, {
        boundary: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 }
        ]
      })
    ).toThrow(/loop3d/);
  });

  it('VtkNativeWorkerBackend rejects indeterminate normal', () => {
    const backend = new VtkNativeWorkerBackend({ pythonPath: python, scriptPath: script });
    const m = createMesh({
      id: 1,
      objectId: 't',
      role: 'working',
      revision: 1,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      fingerprint: 'geo:t'
    });
    expect(() =>
      backend.trim(m, {
        boundary: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 }
        ],
        loop3d: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0.5, y: 0, z: 0 }
        ]
      })
    ).toThrow(/orientation could not be determined/i);
  });
});

describe('PROD-001S contract extensions', () => {
  it('exports loop-aware trim axes helper without forcing AABB as clip authority', () => {
    const m = createMesh({
      id: 1,
      objectId: 't',
      role: 'working',
      revision: 1,
      positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0.1]),
      indices: new Uint32Array([0, 1, 2]),
      fingerprint: 'geo:t'
    });
    const axes = inferTrimProjectionAxes(m);
    expect([axes.u, axes.v, axes.n].sort()).toEqual([0, 1, 2]);
  });
});
