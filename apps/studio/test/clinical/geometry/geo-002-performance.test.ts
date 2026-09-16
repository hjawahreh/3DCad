/**
 * GEO-002 — ClinicalGeometryContext + cache + incremental path + performance.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendSurfacePath,
  BoundaryOperations,
  clinicalGeometryContexts,
  ClinicalGeometryValidation,
  closeSurfacePath,
  createMesh,
  createSurfacePath,
  fingerprintMesh,
  MeshRepairOperations,
  NodeHostGeometryDeliveryClient,
  normalizeMeshTopology,
  probeVtkHttpWorker,
  runGeometryQualityPipeline,
  setGeometryDeliveryClientForTests,
  SurfaceOperations,
  thinSurfacePath,
  VtkHttpWorkerBackend
} from '../../../src/geometry-kernel/index.js';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';
import { buildSyntheticDentalSurface } from '../../../src/geometry-kernel/mesh/MeshRegistry.js';

afterEach(() => {
  setGeometryDeliveryClientForTests(null);
  clinicalGeometryContexts.invalidateAll();
});

describe('GEO-002 ClinicalGeometryContext', () => {
  it('creates, reuses, and invalidates by fingerprint', () => {
    const mesh = buildSyntheticDentalSurface('ctx-a', 1);
    const a = clinicalGeometryContexts.getOrCreate(mesh);
    const b = clinicalGeometryContexts.getOrCreate(mesh);
    expect(a).toBe(b);
    expect(a.hits).toBeGreaterThanOrEqual(1);
    const events = clinicalGeometryContexts.drainEvents();
    expect(events.some((e) => e.event === 'HIT')).toBe(true);

    const mutated = createMesh({
      id: 2,
      objectId: mesh.objectId,
      role: 'working',
      revision: 2,
      positions: mesh.positions.slice(),
      indices: mesh.indices.slice(),
      fingerprint: 'geo:deadbeef'
    });
    const c = clinicalGeometryContexts.getOrCreate(mutated);
    expect(c.geometryFingerprint).toBe('geo:deadbeef');
    expect(c).not.toBe(a);
  });
});

describe('GEO-002 quality levels + surface ops', () => {
  it('level 1 is faster than level 2 and preserves ok for clean mesh', () => {
    const mesh = buildSyntheticDentalSurface('q-levels', 3);
    const t0 = performance.now();
    const l1 = runGeometryQualityPipeline(mesh, { level: 1 });
    const l1Ms = performance.now() - t0;
    const t1 = performance.now();
    const l2 = runGeometryQualityPipeline(mesh, { level: 2 });
    const l2Ms = performance.now() - t1;
    expect(l1.ok).toBe(true);
    expect(l2.ok).toBe(true);
    expect(l1.warnings.some((w) => w.includes('qualityLevel=1'))).toBe(true);
    expect(l2.warnings.some((w) => w.includes('qualityLevel=2'))).toBe(true);
    // Level 1 should not be slower than level 2 on the same mesh.
    expect(l1Ms).toBeLessThanOrEqual(l2Ms + 50);
  });

  it('incremental append does not recompute prior samples', () => {
    const mesh = buildSyntheticDentalSurface('append', 4);
    const seeds = [
      { point: [mesh.positions[0]!, mesh.positions[1]!, mesh.positions[2]!] as const },
      {
        point: [mesh.positions[9]!, mesh.positions[10]!, mesh.positions[11]!] as const
      }
    ];
    const built = createSurfacePath(mesh, [seeds[0]!], { reconstruct: 'never' });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const firstFp = built.path.fingerprint;
    const appended = appendSurfacePath(mesh, built.path, seeds[1]!, {
      reconstruct: 'never'
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    expect(appended.path.samples[0]?.point).toEqual(built.path.samples[0]?.point);
    expect(appended.path.fingerprint).not.toBe(firstFp);
    expect(SurfaceOperations.validatePath(mesh, appended.path).ok).toBe(true);
  });

  it('boundary / repair / validation façades are callable', () => {
    const mesh = buildSyntheticDentalSurface('facade', 5);
    const loops = BoundaryOperations.extractLoops(mesh);
    expect(Array.isArray(loops)).toBe(true);
    const repaired = MeshRepairOperations.removeDegenerateFaces(mesh);
    expect(repaired.fingerprint.length).toBeGreaterThan(0);
    const v = ClinicalGeometryValidation.validateMesh(mesh, 1);
    expect(v.stats.triangleCount).toBeGreaterThan(0);
  });
});

describe('GEO-002 native performance (optional live worker)', () => {
  it('profiles cold/warm trim and matches GEO-001H fingerprint', async () => {
    if (!(await probeVtkHttpWorker())) {
      console.warn('VTK worker unavailable — skip GEO-002 perf');
      return;
    }
    setGeometryDeliveryClientForTests(new NodeHostGeometryDeliveryClient());
    const root = join(fileURLToPath(new URL('../../..', import.meta.url)));
    const buf = readFileSync(join(root, 'public/clinical-fixtures/upper.stl'));
    const parsed = parseClinicalMeshBytes(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      'stl'
    );
    const raw = createMesh({
      id: 1,
      objectId: 'upper-geo002',
      role: 'working',
      revision: 1,
      positions: parsed.positions,
      indices: parsed.indices,
      fingerprint: fingerprintMesh(parsed.positions, parsed.indices)
    });
    const mesh = normalizeMeshTopology(raw).mesh;
    const backend = new VtkHttpWorkerBackend();

    const ensureMs0 = performance.now();
    await backend.ensureGeometry(mesh, { caseId: 'geo-002' });
    const ensureMs = performance.now() - ensureMs0;

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
    const pathT0 = performance.now();
    const built = createSurfacePath(mesh, seeds, {
      closed: false,
      reconstruct: 'never',
      maxProjectDistanceMm: 12,
      maxTotalSamples: 128
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
    const pathMs = performance.now() - pathT0;

    const opts = {
      boundary: loop3d.map((p) => ({ x: p.x, y: p.y })),
      loop3d,
      keepMode: 'KEEP_OUTSIDE' as const,
      algorithm: 'vtk-select-polydata' as const,
      role: 'preview' as const,
      revision: 2,
      id: 2
    };

    const tA = performance.now();
    const a = await backend.trimAsync(mesh, opts);
    const trimAMs = performance.now() - tA;
    const transportA = backend.getLastTransport();

    const tB = performance.now();
    const bTrim = await backend.trimAsync(mesh, { ...opts, revision: 3, id: 3 });
    const trimBMs = performance.now() - tB;
    const transportB = backend.getLastTransport();

    const tC = performance.now();
    const cTrim = await backend.trimAsync(mesh, { ...opts, revision: 4, id: 4 });
    const trimCMs = performance.now() - tC;

    const baselineTrimMs = 10567.99423; // GEO-001H node-host evidence
    const report = {
      baselineTrimMs,
      ensureMs,
      pathMs,
      trimAMs,
      trimBMs,
      trimCMs,
      deltaA: baselineTrimMs - trimAMs,
      pctA: ((baselineTrimMs - trimAMs) / baselineTrimMs) * 100,
      fpA: a.mesh.fingerprint,
      fpB: bTrim.mesh.fingerprint,
      facesA: a.mesh.indices.length / 3,
      transportA,
      transportB,
      qualityLevelA: a.warnings.find((w) => w.includes('qualityLevel')),
      geo001hFingerprint: 'geo:947c05f2'
    };
    console.log(JSON.stringify(report));

    expect(a.mesh.fingerprint).toBe('geo:947c05f2');
    expect(transportA.meshResident).toBe(true);
    expect(transportA.uploadBytes).toBe(0);
    expect(transportB.uploadBytes).toBe(0);
    expect(trimAMs).toBeLessThan(baselineTrimMs * 0.7); // ≥30% improvement target band
    expect(trimBMs).toBeLessThan(trimAMs); // warm should not be slower than cold A meaningfully
    expect(trimBMs).toBeLessThan(8_000);
    expect(cTrim.mesh.fingerprint).not.toBe(mesh.fingerprint);
    // Preview quality should be Level 1.
    expect(a.quality.warnings.some((w) => w.includes('qualityLevel=1'))).toBe(true);
    // Second/third preview must not re-upload mesh (cache / resident).
    expect(transportA.meshResident).toBe(true);
    expect(transportB.meshResident).toBe(true);
  }, 300_000);
});
