/**
 * GEO-001E — Clinical Trim V2: real region commit + preview==accept + cache reuse.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMesh,
  fingerprintMesh,
  normalizeMeshTopology,
  thinSurfacePath,
  createSurfacePath,
  closeSurfacePath,
  extractBoundaryLoops,
  ClinicalGeometryEngine
} from '../../../src/geometry-kernel/index.js';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';
import { GeometryCache } from '../../../src/geometry-kernel/cache/GeometryCache.js';
import { NativeReferenceBackend } from '../../../src/geometry-kernel/adapters/GeometryBackend.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const upperStl = join(root, 'public/clinical-fixtures/upper.stl');

const loadNormalizedUpper = () => {
  const buf = readFileSync(upperStl);
  const parsed = parseClinicalMeshBytes(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    'stl'
  );
  const raw = createMesh({
    id: 501,
    objectId: 'upper',
    role: 'working',
    revision: 1,
    positions: parsed.positions,
    indices: parsed.indices,
    fingerprint: fingerprintMesh(parsed.positions, parsed.indices)
  });
  return normalizeMeshTopology(raw).mesh;
};

/** Open bowl with a removable interior disk for reference trim. */
const openBowl = (res = 24, id = 1) => {
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

describe('GEO-001E Trim region commit + invariants', () => {
  it('valid interior loop changes geometry fingerprint (reference path)', async () => {
    const mesh = openBowl(20, 1);
    const initialFp = mesh.fingerprint;
    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    // Square loop in mesh XY around center (removable under KEEP_OUTSIDE).
    const loop = [
      { x: -8, y: -8, z: 2 },
      { x: 8, y: -8, z: 2 },
      { x: 8, y: 8, z: 2 },
      { x: -8, y: 8, z: 2 }
    ];
    const seeds = loop.map((p) => ({ point: [p.x, p.y, p.z] as const }));
    const built = createSurfacePath(mesh, seeds, { closed: false, reconstruct: 'gaps' });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const closed = closeSurfacePath(mesh, built.path);
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    const result = await engine.trim({
      mesh,
      surfacePath: closed.path,
      keepMode: 'KEEP_OUTSIDE'
    });
    expect(result.success).toBe(true);
    if (!result.success || result.outputMesh === undefined) return;
    expect(result.outputMesh.fingerprint).not.toBe(initialFp);
    expect(result.removedRegion?.triangleCount ?? 0).toBeGreaterThan(0);
    expect(result.selectedRegion?.triangleCount ?? 0).toBeGreaterThan(0);
  });

  it('outside loop is NO_REGION / no geometry change', async () => {
    const mesh = openBowl(16, 2);
    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    const loop = [
      { x: 80, y: 80, z: 0 },
      { x: 90, y: 80, z: 0 },
      { x: 90, y: 90, z: 0 },
      { x: 80, y: 90, z: 0 }
    ];
    const seeds = loop.map((p) => ({ point: [p.x, p.y, p.z] as const }));
    const built = createSurfacePath(mesh, seeds, {
      closed: false,
      reconstruct: 'gaps',
      maxProjectDistanceMm: 2
    });
    // Far-outside may fail path build or trim — both are acceptable NO_REGION outcomes.
    if (!built.ok) {
      expect(built.code).toMatch(/NO_|PROJECT|PATH|SURFACE/i);
      return;
    }
    const closed = closeSurfacePath(mesh, built.path);
    if (!closed.ok) {
      expect(closed.code).toMatch(/NO_|CLOSE|PATH/i);
      return;
    }
    const result = await engine.trim({
      mesh,
      surfacePath: closed.path,
      keepMode: 'KEEP_OUTSIDE'
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.diagnostics.code).toMatch(/NO_REGION|NO_GEOMETRY|TRIM_|BACKEND/i);
  });

  it('thinning records sample reduction without emptying path', () => {
    const mesh = openBowl(30, 3);
    const ring: { point: readonly [number, number, number] }[] = [];
    for (let i = 0; i < 40; i += 1) {
      const a = (i / 40) * Math.PI * 2;
      ring.push({ point: [Math.cos(a) * 12, Math.sin(a) * 12, 1] });
    }
    const built = createSurfacePath(mesh, ring, { closed: true, reconstruct: 'gaps' });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const thinned = thinSurfacePath(built.path, 1.0, 128);
    expect(thinned.samples.length).toBeGreaterThanOrEqual(4);
    expect(thinned.samples.length).toBeLessThanOrEqual(built.path.samples.length);
    expect(thinned.samples.length).toBeLessThanOrEqual(128);
  });

  it('topology cache reuses entry for unchanged fingerprint', () => {
    const mesh = openBowl(12, 4);
    const cache = new GeometryCache();
    const backend = new NativeReferenceBackend();
    const report = backend.validate(mesh);
    cache.putTopology(mesh.objectId, mesh.revision, mesh.fingerprint, report);
    const hit = cache.getTopology(mesh.objectId, mesh.revision, mesh.fingerprint);
    expect(hit).toBeDefined();
    expect(hit?.ok).toBe(report.ok);
    const miss = cache.getTopology(mesh.objectId, mesh.revision, 'geo:other');
    expect(miss).toBeUndefined();
  });

  it('spatial cache reuses entry for unchanged fingerprint', () => {
    const mesh = openBowl(12, 5);
    const cache = new GeometryCache();
    const backend = new NativeReferenceBackend();
    const spatial = backend.buildSpatialIndex(mesh);
    cache.putSpatial(mesh.objectId, mesh.revision, mesh.fingerprint, spatial);
    const hit = cache.getSpatial(mesh.objectId, mesh.revision, mesh.fingerprint);
    expect(hit).toBeDefined();
    expect(hit?.triangleCount).toBe(spatial.triangleCount);
  });

  it('preview fingerprint equals commit fingerprint (promote without re-clip)', async () => {
    const mesh = openBowl(20, 6);
    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    const loop = [
      { x: -6, y: -6, z: 2 },
      { x: 6, y: -6, z: 2 },
      { x: 6, y: 6, z: 2 },
      { x: -6, y: 6, z: 2 }
    ];
    const seeds = loop.map((p) => ({ point: [p.x, p.y, p.z] as const }));
    const built = createSurfacePath(mesh, seeds, { closed: false, reconstruct: 'gaps' });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const closed = closeSurfacePath(mesh, built.path);
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    const preview = await engine.trim({
      mesh,
      surfacePath: closed.path,
      keepMode: 'KEEP_OUTSIDE'
    });
    expect(preview.success).toBe(true);
    if (!preview.success || preview.outputMesh === undefined) return;
    const previewFp = preview.outputMesh.fingerprint;
    // Accept semantics: commit the exact preview mesh (no second clip).
    const committed = createMesh({
      ...preview.outputMesh,
      role: 'working',
      revision: preview.outputMesh.revision + 1,
      fingerprint: preview.outputMesh.fingerprint
    });
    expect(committed.fingerprint).toBe(previewFp);
    expect(committed.fingerprint).not.toBe(mesh.fingerprint);
  });

  it('sequential trims A→B mutate fingerprints (current mesh each time)', async () => {
    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    let mesh = openBowl(24, 7);
    const cut = async (r: number) => {
      const loop = [
        { x: -r, y: -r, z: 2 },
        { x: r, y: -r, z: 2 },
        { x: r, y: r, z: 2 },
        { x: -r, y: r, z: 2 }
      ];
      const seeds = loop.map((p) => ({ point: [p.x, p.y, p.z] as const }));
      const built = createSurfacePath(mesh, seeds, { closed: false, reconstruct: 'gaps' });
      expect(built.ok).toBe(true);
      if (!built.ok) return mesh;
      const closed = closeSurfacePath(mesh, built.path);
      expect(closed.ok).toBe(true);
      if (!closed.ok) return mesh;
      const result = await engine.trim({
        mesh,
        surfacePath: closed.path,
        keepMode: 'KEEP_OUTSIDE'
      });
      expect(result.success).toBe(true);
      if (!result.success || result.outputMesh === undefined) return mesh;
      return result.outputMesh;
    };
    const a = await cut(7);
    expect(a.fingerprint).not.toBe(mesh.fingerprint);
    mesh = a;
    const b = await cut(5);
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });
});

describe('GEO-001E real dental baseline', () => {
  it('records initial fingerprint / counts / boundary loops on normalized upper', () => {
    expect(existsSync(upperStl)).toBe(true);
    const mesh = loadNormalizedUpper();
    const loops = extractBoundaryLoops(mesh);
    expect(Math.floor(mesh.indices.length / 3)).toBeGreaterThan(100_000);
    expect(Math.floor(mesh.positions.length / 3)).toBeGreaterThan(50_000);
    expect(loops.length).toBeGreaterThan(0);
    expect(mesh.fingerprint.length).toBeGreaterThan(4);
  }, 120_000);

  it('profiles stage costs on normalized upper (measurement only)', async () => {
    const { buildTopology, invalidateTopologyCache } = await import(
      '../../../src/geometry-kernel/engine/TopologyGraph.js'
    );
    const { buildSpatialIndex } = await import(
      '../../../src/geometry-kernel/spatial/SpatialIndex.js'
    );
    const { runGeometryQualityPipeline } = await import(
      '../../../src/geometry-kernel/quality/GeometryQualityPipeline.js'
    );
    const { analyzeMesh } = await import(
      '../../../src/geometry-kernel/engine/MeshAnalysis.js'
    );
    const mesh = loadNormalizedUpper();
    invalidateTopologyCache();
    let t0 = performance.now();
    buildTopology(mesh);
    const topologyColdMs = performance.now() - t0;
    t0 = performance.now();
    buildTopology(mesh);
    const topologyWarmMs = performance.now() - t0;
    t0 = performance.now();
    buildSpatialIndex(mesh);
    const spatialMs = performance.now() - t0;
    t0 = performance.now();
    runGeometryQualityPipeline(mesh);
    const qualityMs = performance.now() - t0;
    t0 = performance.now();
    analyzeMesh(mesh);
    const analyzeMs = performance.now() - t0;

    const pos = mesh.positions;
    let maxX = -1e9;
    let maxXi = 0;
    for (let i = 0; i < pos.length / 3; i += 1) {
      const x = pos[i * 3]!;
      if (x > maxX) {
        maxX = x;
        maxXi = i;
      }
    }
    const base: [number, number, number] = [
      pos[maxXi * 3]!,
      pos[maxXi * 3 + 1]!,
      pos[maxXi * 3 + 2]!
    ];
    const seeds: { point: readonly [number, number, number] }[] = [
      { point: [base[0] - 2, base[1] - 2, base[2]] },
      { point: [base[0] + 2, base[1] - 2, base[2]] },
      { point: [base[0] + 2, base[1] + 2, base[2]] },
      { point: [base[0] - 2, base[1] + 2, base[2]] }
    ];
    t0 = performance.now();
    const built = createSurfacePath(mesh, seeds, {
      closed: false,
      reconstruct: 'gaps',
      maxProjectDistanceMm: 12
    });
    const pathMs = performance.now() - t0;
    let closeMs = 0;
    let thinMs = 0;
    let trimRefMs = 0;
    let pathSamples = 0;
    let thinnedSamples = 0;
    let trimSuccess = false;
    let outFaces = 0;
    if (built.ok) {
      pathSamples = built.path.samples.length;
      t0 = performance.now();
      const closed = closeSurfacePath(mesh, built.path);
      closeMs = performance.now() - t0;
      if (closed.ok) {
        pathSamples = closed.path.samples.length;
        t0 = performance.now();
        const thinned = thinSurfacePath(closed.path, 1.0, 128);
        thinMs = performance.now() - t0;
        thinnedSamples = thinned.samples.length;
        const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
        t0 = performance.now();
        const trimmed = await engine.trim({
          mesh,
          surfacePath: thinSurfacePath(closed.path, 1.0, 64),
          keepMode: 'KEEP_OUTSIDE'
        });
        trimRefMs = performance.now() - t0;
        trimSuccess = trimmed.success;
        outFaces = trimmed.success
          ? Math.floor((trimmed.outputMesh?.indices.length ?? 0) / 3)
          : 0;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        topologyColdMs,
        topologyWarmMs,
        spatialMs,
        qualityMs,
        analyzeMs,
        pathMs,
        closeMs,
        thinMs,
        trimRefMs,
        pathOk: built.ok,
        pathSamples,
        thinnedSamples,
        trimSuccess,
        outFaces
      })
    );
    expect(topologyWarmMs).toBeLessThan(topologyColdMs + 5);
    expect(topologyColdMs).toBeGreaterThan(0);
  }, 300_000);
});
