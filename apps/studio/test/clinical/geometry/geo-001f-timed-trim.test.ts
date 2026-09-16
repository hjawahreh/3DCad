/**
 * GEO-001F — Node-side timed Trim on real upper (measures worker path without Playwright).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

describe('GEO-001F node timed real trim', () => {
  it('times ensure+trim+trim on upper', async () => {
    expect(await probeVtkHttpWorker()).toBe(true);
    const buf = readFileSync(join(root, 'public/clinical-fixtures/upper.stl'));
    const parsed = parseClinicalMeshBytes(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      'stl'
    );
    const raw = createMesh({
      id: 1,
      objectId: 'upper-timed',
      role: 'working',
      revision: 1,
      positions: parsed.positions,
      indices: parsed.indices,
      fingerprint: fingerprintMesh(parsed.positions, parsed.indices)
    });
    const mesh = normalizeMeshTopology(raw).mesh;
    const backend = new VtkHttpWorkerBackend();
    let t0 = performance.now();
    await backend.ensureGeometry(mesh, { caseId: 'timed' });
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({ ensureMs: performance.now() - t0, transport: backend.getLastTransport() })
    );
    const pos = mesh.positions;
    let maxX = -1e9;
    let maxXi = 0;
    for (let i = 0; i < pos.length / 3; i += 1) {
      if (pos[i * 3]! > maxX) {
        maxX = pos[i * 3]!;
        maxXi = i;
      }
    }
    const base: [number, number, number] = [
      pos[maxXi * 3]!,
      pos[maxXi * 3 + 1]!,
      pos[maxXi * 3 + 2]!
    ];
    const seeds = [
      { point: [base[0] - 2, base[1] - 2, base[2]] as const },
      { point: [base[0] + 2, base[1] - 2, base[2]] as const },
      { point: [base[0] + 2, base[1] + 2, base[2]] as const },
      { point: [base[0] - 2, base[1] + 2, base[2]] as const }
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
    t0 = performance.now();
    const first = await backend.trimAsync(mesh, opts);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        trim1Ms: performance.now() - t0,
        fp: first.mesh.fingerprint,
        faces: first.mesh.indices.length / 3,
        transport: backend.getLastTransport(),
        warnings: first.warnings.filter(
          (w) =>
            w.startsWith('timing:') ||
            w.startsWith('meta:upload') ||
            w.startsWith('meta:download') ||
            w.startsWith('meta:mesh') ||
            w.startsWith('meta:request')
        )
      })
    );
    t0 = performance.now();
    const second = await backend.trimAsync(mesh, {
      ...opts,
      revision: 3,
      id: 3,
      loop3d: loop3d.map((p) => ({ x: p.x * 0.95, y: p.y * 0.95, z: p.z }))
    });
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        trim2Ms: performance.now() - t0,
        transport: backend.getLastTransport(),
        warnings: second.warnings.filter(
          (w) =>
            w.startsWith('timing:') ||
            w.startsWith('meta:upload') ||
            w.startsWith('meta:download') ||
            w.startsWith('meta:mesh') ||
            w.startsWith('meta:request')
        )
      })
    );
    expect(first.mesh.fingerprint).not.toBe(mesh.fingerprint);
    expect(backend.getLastTransport().uploadBytes).toBe(0);
  }, 300_000);
});
