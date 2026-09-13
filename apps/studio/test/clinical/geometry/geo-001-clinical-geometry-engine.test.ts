/**
 * GEO-001 clinical geometry engine unit + fixture tests.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClinicalGeometryEngine,
  buildSyntheticDentalSurface,
  createMesh,
  fingerprintMesh,
  selectBackendForCapability,
  validateSurfacePath
} from '../../../src/geometry-kernel/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const upperStl = join(root, 'apps/studio/public/clinical-fixtures/upper.stl');
const lowerStl = join(root, 'apps/studio/public/clinical-fixtures/lower.stl');

const planarGrid = (n = 10) => {
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

describe('GEO-001 ClinicalGeometryEngine — analysis', () => {
  it('analyzes synthetic dental surface without fabricating watertight', () => {
    const mesh = buildSyntheticDentalSurface('jaw', 1, { gridResolution: 12 });
    const engine = new ClinicalGeometryEngine();
    const report = engine.analyzeMesh(mesh);
    expect(report.vertexCount).toBeGreaterThan(0);
    expect(report.triangleCount).toBeGreaterThan(0);
    expect(report.watertight).toBe(false);
    expect(report.boundaryEdgeCount).toBeGreaterThan(0);
    expect(report.fingerprint).toBe(mesh.fingerprint);
    expect(['PASS', 'WARNING', 'FAIL']).toContain(report.gate);
  });

  it('builds topology and extracts boundary loops', () => {
    const mesh = buildSyntheticDentalSurface('jaw', 2, { gridResolution: 8 });
    const engine = new ClinicalGeometryEngine();
    const topo = engine.buildTopology(mesh);
    expect(topo.faceCount).toBe(Math.floor(mesh.indices.length / 3));
    expect(topo.boundaryEdges.length).toBeGreaterThan(0);
    const loops = engine.extractBoundaries(mesh);
    expect(loops.length).toBeGreaterThan(0);
    expect(loops[0]!.closed).toBe(true);
    expect(loops[0]!.perimeter).toBeGreaterThan(0);
  });
});

describe('GEO-001 spatial + surface projection', () => {
  it('ray hits planar grid and misses empty space', () => {
    const mesh = planarGrid(8);
    const engine = new ClinicalGeometryEngine();
    const hit = engine.rayIntersect(mesh, [3.2, 3.2, 5], [0, 0, -1]);
    expect(hit.hit).toBe(true);
    if (hit.hit) {
      expect(hit.point[2]).toBeCloseTo(0, 5);
      expect(hit.faceId).toBeGreaterThanOrEqual(0);
    }
    const miss = engine.rayIntersect(mesh, [100, 100, 5], [0, 0, -1]);
    expect(miss.hit).toBe(false);
  });

  it('never fabricates nearest surface hit beyond max distance', () => {
    const mesh = planarGrid(6);
    const engine = new ClinicalGeometryEngine();
    const miss = engine.nearestSurface(mesh, [100, 100, 100], 1);
    expect(miss.hit).toBe(false);
  });

  it('projects and builds a closed surface path on grid', () => {
    const mesh = planarGrid(12);
    const engine = new ClinicalGeometryEngine();
    const built = engine.buildSurfacePath(
      mesh,
      [
        { point: [3, 3, 0] },
        { point: [8, 3, 0] },
        { point: [8, 8, 0] },
        { point: [3, 8, 0] }
      ],
      { closed: true, reconstruct: false }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const closedResult = engine.closeSurfacePath(mesh, built.path);
    expect(closedResult.ok).toBe(true);
    if (!closedResult.ok) return;
    const closed = closedResult.path;
    const validated = engine.validateSurfacePath(mesh, closed);
    expect(validated.ok).toBe(true);
    expect(closed.samples.length).toBeGreaterThanOrEqual(4);
    expect(closed.length).toBeGreaterThan(0);
  });

  it('rejects self-intersecting closed path', () => {
    const mesh = planarGrid(12);
    const engine = new ClinicalGeometryEngine();
    const built = engine.buildSurfacePath(
      mesh,
      [
        { point: [2, 2, 0] },
        { point: [8, 8, 0] },
        { point: [2, 8, 0] },
        { point: [8, 2, 0] }
      ],
      { closed: false, reconstruct: false }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const closedResult = engine.closeSurfacePath(mesh, built.path);
    expect(closedResult.ok).toBe(false);
    if (!closedResult.ok) {
      expect(closedResult.message).toMatch(/crosses itself/i);
      return;
    }
    const validated = validateSurfacePath(mesh, closedResult.path, { maxSpacingMm: 40 });
    expect(validated.ok).toBe(false);
    if (!validated.ok) {
      expect(validated.message).toMatch(/self-intersect|crosses itself/i);
    }
  });
});

describe('GEO-001 trim + base engines', () => {
  it('trims a convex region on planar grid via ClinicalTrimEngine', async () => {
    const mesh = planarGrid(12);
    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    const built = engine.buildSurfacePath(
      mesh,
      [
        { point: [3, 3, 0] },
        { point: [8, 3, 0] },
        { point: [8, 8, 0] },
        { point: [3, 8, 0] }
      ],
      { closed: true, reconstruct: false }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const pathResult = engine.closeSurfacePath(mesh, built.path);
    expect(pathResult.ok).toBe(true);
    if (!pathResult.ok) return;
    const path = pathResult.path;
    const result = await engine.trim({
      mesh,
      surfacePath: path,
      keepMode: 'KEEP_OUTSIDE'
    });
    expect(result.success).toBe(true);
    expect(result.outputMesh).toBeDefined();
    expect(result.removedSurfaceArea).toBeGreaterThan(0);
    expect(result.outputMesh!.fingerprint).not.toBe(mesh.fingerprint);
    expect(result.diagnostics.code).toBe('OK');
  });

  it('creates base from open synthetic dental surface', async () => {
    const mesh = buildSyntheticDentalSurface('jaw', 3, { gridResolution: 10 });
    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    const result = await engine.createBase({
      trimmedMesh: mesh,
      baseStrategy: 'plane',
      parameters: { height: 2, thickness: 1.5, preferClinicalFrame: false }
    });
    expect(result.success).toBe(true);
    expect(result.outputMesh).toBeDefined();
    expect(result.addedTriangles).toBeGreaterThan(0);
    expect(result.selectedBoundary).toBeDefined();
    expect(result.diagnostics.warnings.some((w) => /boundary|selectedBoundary/i.test(w))).toBe(
      true
    );
  });

  it('selectBackend reports explicit capability reasons', () => {
    const sel = selectBackendForCapability('TRIM_CLIPPING', { vtkHealthy: true });
    expect(sel.backendId.length).toBeGreaterThan(0);
    expect(sel.reason).toMatch(/selected|forced/i);
  });
});

describe('GEO-001 real dental fixtures', () => {
  it('records fixture availability for clinical-geometry-fixtures', () => {
    expect(existsSync(upperStl)).toBe(true);
    expect(existsSync(lowerStl)).toBe(true);
  });

  it('analyzes synthetic stand-in when STL parse is not in-kernel', () => {
    // Kernel keeps STL import at clinical import layer; engine certifies analysis APIs
    // on synthetic open surfaces that mirror clinical fixture topology class.
    const mesh = buildSyntheticDentalSurface('upper-fixture-proxy', 10, {
      gridResolution: 24,
      bounds: { min: [-30, -25, 0], max: [30, 25, 12] }
    });
    const engine = new ClinicalGeometryEngine();
    const report = engine.analyzeMesh(mesh);
    expect(report.triangleCount).toBeGreaterThan(500);
    expect(report.watertight).toBe(false);
    const spatial = engine.buildSpatialIndex(mesh);
    expect(spatial.bvhRoot).toBeDefined();
    const hit = engine.projectToSurface(mesh, [0, 0, 20], 25);
    expect(hit.hit).toBe(true);
  });
});

describe('GEO-001 determinism', () => {
  it('same mesh + path yields same fingerprint twice', async () => {
    const mesh = planarGrid(10);
    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    const built = engine.buildSurfacePath(
      mesh,
      [
        { point: [2, 2, 0] },
        { point: [7, 2, 0] },
        { point: [7, 7, 0] },
        { point: [2, 7, 0] }
      ],
      { closed: true, reconstruct: false }
    );
    if (!built.ok) throw new Error(built.message);
    const pathResult = engine.closeSurfacePath(mesh, built.path);
    expect(pathResult.ok).toBe(true);
    if (!pathResult.ok) return;
    const path = pathResult.path;
    const a = await engine.trim({ mesh, surfacePath: path, keepMode: 'KEEP_OUTSIDE' });
    const b = await engine.trim({ mesh, surfacePath: path, keepMode: 'KEEP_OUTSIDE' });
    expect(a.success && b.success).toBe(true);
    expect(a.outputMesh!.fingerprint).toBe(b.outputMesh!.fingerprint);
  });
});
