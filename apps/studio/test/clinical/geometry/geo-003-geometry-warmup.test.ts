/**
 * GEO-003 — geometry warmup + editing readiness.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildClinicalSpatialIndex,
  clinicalGeometryContexts,
  closeSurfacePath,
  createMesh,
  createSurfacePath,
  geometryWarmup,
  invalidateSpatialCache,
  NodeHostGeometryDeliveryClient,
  normalizeMeshTopology,
  probeVtkHttpWorker,
  setGeometryDeliveryClientForTests,
  thinSurfacePath,
  VtkHttpWorkerBackend
} from '../../../src/geometry-kernel/index.js';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';
import { buildSyntheticDentalSurface } from '../../../src/geometry-kernel/mesh/MeshRegistry.js';

afterEach(() => {
  setGeometryDeliveryClientForTests(null);
  geometryWarmup.invalidateAll();
  clinicalGeometryContexts.invalidateAll();
  invalidateSpatialCache();
});

describe('GEO-003 geometry warmup lifecycle', () => {
  it('creates warmup and reaches READY', async () => {
    const mesh = buildSyntheticDentalSurface('warm-a', 1);
    const status = await geometryWarmup.warmMesh(mesh, { arch: 'upper' });
    expect(status.state).toBe('READY');
    expect(status.geometryFingerprint).toBe(mesh.fingerprint);
    expect(status.timings.totalWarmupMs).toBeGreaterThan(0);
    expect(geometryWarmup.isReady(mesh.objectId, mesh.fingerprint)).toBe(true);
    const ctx = clinicalGeometryContexts.get(mesh.objectId);
    expect(ctx?.clinicalSpatial).toBeDefined();
    expect(ctx?.topology).toBeDefined();
    expect(ctx?.readyState).toBe('READY');
  });

  it('reuses READY context (HIT) without rebuilding', async () => {
    const mesh = buildSyntheticDentalSurface('warm-reuse', 2);
    const a = await geometryWarmup.warmMesh(mesh);
    const t0 = performance.now();
    const b = await geometryWarmup.warmMesh(mesh);
    const reuseMs = performance.now() - t0;
    expect(b).toBe(a);
    expect(reuseMs).toBeLessThan(50);
    expect(b.state).toBe('READY');
  });

  it('invalidates on fingerprint change and rewarms', async () => {
    const mesh = buildSyntheticDentalSurface('warm-inv', 3);
    await geometryWarmup.warmMesh(mesh);
    expect(geometryWarmup.isReady(mesh.objectId, mesh.fingerprint)).toBe(true);

    const mutated = createMesh({
      id: 99,
      objectId: mesh.objectId,
      role: 'working',
      revision: 2,
      positions: mesh.positions.slice(),
      indices: mesh.indices.slice(),
      fingerprint: 'geo:mutated003'
    });
    const next = await geometryWarmup.invalidateAndRewarm(mutated);
    expect(next.geometryFingerprint).toBe('geo:mutated003');
    expect(next.state).toBe('READY');
    expect(geometryWarmup.isReady(mesh.objectId, mesh.fingerprint)).toBe(false);
    expect(geometryWarmup.isReady(mutated.objectId, mutated.fingerprint)).toBe(true);
  });

  it('cancels in-flight warmup', async () => {
    const mesh = buildSyntheticDentalSurface('warm-cancel', 4);
    const controller = new AbortController();
    const pending = geometryWarmup.warmMesh(mesh, { signal: controller.signal });
    controller.abort();
    const status = await pending;
    expect(status.state === 'FAILED' || status.state === 'NOT_READY' || status.state === 'READY').toBe(
      true
    );
    // After cancel API, object should not remain WARMING forever.
    geometryWarmup.cancel(mesh.objectId);
    const after = geometryWarmup.getStatus(mesh.objectId);
    expect(after?.state).not.toBe('WARMING');
  });

  it('isolates UPPER and LOWER contexts', async () => {
    const upper = buildSyntheticDentalSurface('warm-upper', 5);
    const lower = createMesh({
      id: 6,
      objectId: 'warm-lower',
      role: 'working',
      revision: 1,
      positions: upper.positions.slice(),
      indices: upper.indices.slice()
    });
    await geometryWarmup.warmMesh(upper, { arch: 'upper' });
    await geometryWarmup.warmMesh(lower, { arch: 'lower' });
    expect(geometryWarmup.isReady(upper.objectId, upper.fingerprint)).toBe(true);
    expect(geometryWarmup.isReady(lower.objectId, lower.fingerprint)).toBe(true);
    geometryWarmup.invalidate(upper.objectId);
    expect(geometryWarmup.isReady(upper.objectId, upper.fingerprint)).toBe(false);
    expect(geometryWarmup.isReady(lower.objectId, lower.fingerprint)).toBe(true);
  });

  it('BOTH keeps independent contexts (no merged index)', async () => {
    const upper = buildSyntheticDentalSurface('both-u', 7);
    const lower = createMesh({
      id: 8,
      objectId: 'both-l',
      role: 'working',
      revision: 1,
      positions: upper.positions.slice(),
      indices: upper.indices.slice()
    });
    await Promise.all([
      geometryWarmup.warmMesh(upper, { arch: 'upper' }),
      geometryWarmup.warmMesh(lower, { arch: 'lower' })
    ]);
    const u = clinicalGeometryContexts.get(upper.objectId);
    const l = clinicalGeometryContexts.get(lower.objectId);
    expect(u?.clinicalSpatial).toBeDefined();
    expect(l?.clinicalSpatial).toBeDefined();
    expect(u?.objectId).not.toBe(l?.objectId);
    expect(geometryWarmup.getStatus(upper.objectId)?.arch).toBe('upper');
    expect(geometryWarmup.getStatus(lower.objectId)?.arch).toBe('lower');
  });

  it('case switch clears prior warmup (invalidateAll)', async () => {
    const mesh = buildSyntheticDentalSurface('case-a', 9);
    await geometryWarmup.warmMesh(mesh);
    expect(geometryWarmup.listStatuses().length).toBeGreaterThan(0);
    geometryWarmup.invalidateAll();
    expect(geometryWarmup.listStatuses().length).toBe(0);
    expect(clinicalGeometryContexts.get(mesh.objectId)).toBeUndefined();
  });

  it('assertReadyForEdit throws while warming / failed', async () => {
    const mesh = buildSyntheticDentalSurface('assert', 10);
    expect(() => geometryWarmup.assertReadyForEdit(mesh.objectId, mesh.fingerprint)).toThrow(
      /not prepared|Preparing/
    );
    await geometryWarmup.warmMesh(mesh);
    expect(() => geometryWarmup.assertReadyForEdit(mesh.objectId, mesh.fingerprint)).not.toThrow();
  });

  it('first SurfacePath after warmup hits spatial cache', async () => {
    const mesh = buildSyntheticDentalSurface('path-warm', 11);
    await geometryWarmup.warmMesh(mesh);
    const t0 = performance.now();
    const spatial = buildClinicalSpatialIndex(mesh);
    const hitMs = performance.now() - t0;
    expect(spatial.meshFingerprint).toBe(mesh.fingerprint);
    expect(hitMs).toBeLessThan(25);
    const path = createSurfacePath(
      mesh,
      [{ point: [mesh.positions[0]!, mesh.positions[1]!, mesh.positions[2]!] }],
      { reconstruct: 'never' }
    );
    expect(path.ok).toBe(true);
  });
});

describe('GEO-003 first Trim after warmup (optional live worker)', () => {
  it('first Trim after warmup approaches warm timing and matches GEO-002 fingerprint', async () => {
    if (!(await probeVtkHttpWorker())) {
      console.warn('VTK worker unavailable — skip GEO-003 perf');
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
      objectId: 'upper-geo003',
      role: 'working',
      revision: 1,
      positions: parsed.positions,
      indices: parsed.indices
    });
    const mesh = normalizeMeshTopology(raw).mesh;
    expect(Math.floor(mesh.indices.length / 3)).toBeGreaterThan(200_000);

    const GEO002_COLD_MS = 4200;
    const GEO001H_FP = 'geo:947c05f2';

    const warmup = await geometryWarmup.warmMesh(mesh, {
      arch: 'upper',
      backend: new VtkHttpWorkerBackend()
    });
    expect(warmup.state).toBe('READY');
    console.log(
      JSON.stringify({
        warmupTotalMs: warmup.timings.totalWarmupMs,
        topologyMs: warmup.timings.topologyMs,
        spatialIndexMs: warmup.timings.spatialIndexMs,
        backendMs: warmup.timings.backendMs
      })
    );

    const spat0 = performance.now();
    buildClinicalSpatialIndex(mesh);
    const spatHitMs = performance.now() - spat0;
    expect(spatHitMs).toBeLessThan(50);

    const backend = new VtkHttpWorkerBackend();
    await backend.ensureGeometry(mesh, { caseId: 'geo-003' });

    const pos = mesh.positions;
    let maxX = -1e9;
    let maxXi = 0;
    for (let i = 0; i < pos.length / 3; i += 1) {
      if (pos[i * 3]! > maxX) {
        maxX = pos[i * 3]!;
        maxXi = i;
      }
    }
    const tip = [pos[maxXi * 3]!, pos[maxXi * 3 + 1]!, pos[maxXi * 3 + 2]!] as const;
    const seeds = [
      { point: [tip[0] - 2, tip[1] - 2, tip[2]] as const },
      { point: [tip[0] + 2, tip[1] - 2, tip[2]] as const },
      { point: [tip[0] + 2, tip[1] + 2, tip[2]] as const },
      { point: [tip[0] - 2, tip[1] + 2, tip[2]] as const }
    ];
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

    const opts = {
      boundary: loop3d.map((p) => ({ x: p.x, y: p.y })),
      loop3d,
      keepMode: 'KEEP_OUTSIDE' as const,
      algorithm: 'vtk-select-polydata' as const,
      role: 'preview' as const,
      revision: 2,
      id: 2
    };

    const tA0 = performance.now();
    const trimA = await backend.trimAsync(mesh, opts);
    const trimAMs = performance.now() - tA0;

    const tB0 = performance.now();
    const trimB = await backend.trimAsync(mesh, { ...opts, revision: 3, id: 3 });
    const trimBMs = performance.now() - tB0;

    expect(trimA.mesh.fingerprint).toBe(GEO001H_FP);
    expect(trimB.mesh.fingerprint).toBe(trimA.mesh.fingerprint);
    // First Trim after warmup must beat GEO-002 cold and not hide a 9–10s spatial rebuild.
    expect(trimAMs).toBeLessThan(GEO002_COLD_MS * 0.9);
    expect(spatHitMs).toBeLessThan(50);

    console.log(
      JSON.stringify({
        geo002ColdMs: GEO002_COLD_MS,
        spatHitMs,
        trimAMs,
        trimBMs,
        fp: trimA.mesh.fingerprint,
        deltaVsCold: GEO002_COLD_MS - trimAMs,
        pctVsCold: ((GEO002_COLD_MS - trimAMs) / GEO002_COLD_MS) * 100
      })
    );
  }, 180_000);
});
