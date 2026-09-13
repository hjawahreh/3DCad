/**
 * GEO-001C — SurfacePath adaptive sampling, geodesic segments, self-intersection, closure.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClinicalGeometryEngine,
  createMesh,
  fingerprintMesh,
  normalizeMeshTopology,
  createSurfacePath,
  closeSurfacePath,
  validateSurfacePath,
  adaptiveSampleSpacingMm,
  measureSurfacePathQuality,
  simplifySurfacePath,
  clinicalSurfacePathMessage,
  countSelfIntersections,
  projectPointToSurface,
  analyzeMesh
} from '../../../src/geometry-kernel/index.js';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const upperStl = join(root, 'apps/studio/public/clinical-fixtures/upper.stl');

const makeIndexedGrid = (
  n: number,
  zFn: (x: number, y: number) => number,
  id = 1
) => {
  const positions = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const idx = (j * n + i) * 3;
      const x = i;
      const y = j;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = zFn(x, y);
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
    id,
    objectId: `grid-${String(id)}`,
    role: 'working',
    revision: 1,
    positions,
    indices,
    fingerprint: fingerprintMesh(positions, indices)
  });
};

/** 1. Convex curved arch (parabolic ridge). */
const convexCurvedArch = (n = 24) =>
  makeIndexedGrid(n, (x, y) => {
    const cx = (n - 1) / 2;
    const cy = (n - 1) / 2;
    const dx = x - cx;
    const dy = y - cy;
    return 4 - (dx * dx + dy * dy) * 0.035;
  }, 11);

/** 2. Concave curved arch (bowl). */
const concaveCurvedArch = (n = 24) =>
  makeIndexedGrid(n, (x, y) => {
    const cx = (n - 1) / 2;
    const cy = (n - 1) / 2;
    const dx = x - cx;
    const dy = y - cy;
    return (dx * dx + dy * dy) * 0.04;
  }, 12);

/** 3. Highly curved dental-like strip. */
const highlyCurvedStrip = (n = 28) =>
  makeIndexedGrid(n, (x, y) => Math.sin(x * 0.55) * 2.2 + Math.cos(y * 0.4) * 1.4, 13);

/** 4. Sparse mesh. */
const sparseMesh = () => makeIndexedGrid(6, () => 0, 14);

/** 5. Dense mesh. */
const denseMesh = () => makeIndexedGrid(40, (x) => Math.sin(x * 0.2) * 0.3, 15);

/** 6. Triangle-soup then EXACT-weld normalize. */
const normalizedSoup = () => {
  const soupPositions: number[] = [];
  const soupIndices: number[] = [];
  let v = 0;
  for (let j = 0; j < 8; j += 1) {
    for (let i = 0; i < 8; i += 1) {
      const x0 = i;
      const y0 = j;
      const zAt = (x: number, y: number) => Math.sin(x * 0.4) * 0.5 + Math.cos(y * 0.3) * 0.25;
      const verts = [
        [x0, y0, zAt(x0, y0)],
        [x0 + 1, y0, zAt(x0 + 1, y0)],
        [x0, y0 + 1, zAt(x0, y0 + 1)],
        [x0 + 1, y0, zAt(x0 + 1, y0)],
        [x0 + 1, y0 + 1, zAt(x0 + 1, y0 + 1)],
        [x0, y0 + 1, zAt(x0, y0 + 1)]
      ] as const;
      for (const p of verts) {
        soupPositions.push(p[0], p[1], p[2]);
        soupIndices.push(v++);
      }
    }
  }
  const positions = new Float32Array(soupPositions);
  const indices = new Uint32Array(soupIndices);
  const raw = createMesh({
    id: 16,
    objectId: 'soup',
    role: 'source',
    revision: 1,
    positions,
    indices,
    fingerprint: fingerprintMesh(positions, indices)
  });
  return normalizeMeshTopology(raw).mesh;
};

const seedHits = (
  mesh: ReturnType<typeof makeIndexedGrid>,
  pts: readonly (readonly [number, number, number])[],
  maxDist = 8
) => {
  const seeds = [];
  for (const p of pts) {
    const hit = projectPointToSurface(mesh, p, undefined, maxDist);
    expect(hit.hit).toBe(true);
    if (!hit.hit) throw new Error('miss');
    seeds.push({ point: hit.point, faceId: hit.faceId, normal: hit.normal });
  }
  return seeds;
};

describe('GEO-001C SurfacePath robustness fixtures', () => {
  it('1–3: curved arches keep closed path on one component without false disconnect', () => {
    for (const mesh of [convexCurvedArch(), concaveCurvedArch(), highlyCurvedStrip()]) {
      const n = Math.sqrt(mesh.positions.length / 3);
      const c = (n - 1) / 2;
      const seeds = seedHits(mesh, [
        [c - 4, c - 3, 10],
        [c + 4, c - 3, 10],
        [c + 4, c + 3, 10],
        [c - 4, c + 3, 10]
      ], 20);
      const built = createSurfacePath(mesh, seeds, {
        closed: true,
        reconstruct: 'always',
        maxProjectDistanceMm: 20
      });
      expect(built.ok).toBe(true);
      if (!built.ok) throw new Error(built.message);
      const validated = validateSurfacePath(mesh, built.path, { maxSpacingMm: 40 });
      expect(validated.ok).toBe(true);
      if (!validated.ok) throw new Error(validated.message);
      expect(new Set(built.path.samples.map((s) => s.componentId)).size).toBe(1);
      expect(built.path.samples.every((s) => s.faceId >= 0)).toBe(true);
    }
  });

  it('4–5: sparse and dense meshes adapt sampling without redundant collapse', () => {
    const sparse = sparseMesh();
    const dense = denseMesh();
    const sparseSpacing = adaptiveSampleSpacingMm(sparse, 0, 0.35);
    const denseSpacing = adaptiveSampleSpacingMm(dense, 0, 0.35);
    expect(sparseSpacing).toBeGreaterThanOrEqual(0.2);
    expect(denseSpacing).toBeLessThanOrEqual(1.25);

    const sparseSeeds = seedHits(sparse, [
      [1.2, 1.2, 2],
      [3.8, 1.2, 2],
      [3.8, 3.8, 2],
      [1.2, 3.8, 2]
    ]);
    const denseSeeds = seedHits(dense, [
      [8, 8, 2],
      [28, 8, 2],
      [28, 28, 2],
      [8, 28, 2]
    ]);
    const sparsePath = createSurfacePath(sparse, sparseSeeds, {
      closed: true,
      reconstruct: 'always'
    });
    const densePath = createSurfacePath(dense, denseSeeds, {
      closed: true,
      reconstruct: 'gaps'
    });
    expect(sparsePath.ok).toBe(true);
    expect(densePath.ok).toBe(true);
    if (!sparsePath.ok || !densePath.ok) return;
    expect(sparsePath.path.samples.length).toBeGreaterThanOrEqual(4);
    expect(densePath.path.samples.length).toBeLessThan(5000);
  });

  it('6: triangle-soup normalized mesh accepts a closed surface path', () => {
    const mesh = normalizedSoup();
    const report = analyzeMesh(mesh);
    expect(report.connectedComponentCount).toBe(1);
    const seeds = seedHits(mesh, [
      [1.5, 1.5, 2],
      [5.5, 1.5, 2],
      [5.5, 5.5, 2],
      [1.5, 5.5, 2]
    ]);
    const built = createSurfacePath(mesh, seeds, { closed: true, reconstruct: 'always' });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error(built.message);
    expect(validateSurfacePath(mesh, built.path, { maxSpacingMm: 40 }).ok).toBe(true);
  });

  it('7: repeated near points are repaired without failing a valid loop', () => {
    const mesh = convexCurvedArch(20);
    const c = 9.5;
    const base = seedHits(mesh, [
      [c - 3, c - 2, 10],
      [c + 3, c - 2, 10],
      [c + 3, c + 2, 10],
      [c - 3, c + 2, 10]
    ], 20);
    const noisy = [
      base[0]!,
      { ...base[0]!, point: [...base[0]!.point] as [number, number, number] },
      base[1]!,
      base[2]!,
      base[3]!
    ];
    const built = createSurfacePath(mesh, noisy, { closed: true, reconstruct: 'gaps' });
    expect(built.ok).toBe(true);
  });

  it('8: self-crossing input is rejected', () => {
    const mesh = makeIndexedGrid(16, () => 0, 18);
    const built = createSurfacePath(
      mesh,
      [
        { point: [2, 2, 0] },
        { point: [12, 12, 0] },
        { point: [2, 12, 0] },
        { point: [12, 2, 0] }
      ],
      { closed: false, reconstruct: false }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const closed = closeSurfacePath(mesh, built.path);
    expect(closed.ok).toBe(false);
    if (!closed.ok) {
      expect(closed.code).toBe('SELF_INTERSECTS');
      expect(clinicalSurfacePathMessage(closed.code, closed.message)).toMatch(/crosses itself/i);
    }
  });

  it('9: large polyline anchor gap uses geodesic reconstruction', () => {
    const mesh = highlyCurvedStrip(30);
    const seeds = seedHits(
      mesh,
      [
        [3, 8, 20],
        [26, 8, 20],
        [26, 22, 20],
        [3, 22, 20]
      ],
      25
    );
    const chord = createSurfacePath(mesh, seeds, {
      closed: true,
      reconstruct: 'never',
      maxProjectDistanceMm: 25
    });
    const geodesic = createSurfacePath(mesh, seeds, {
      closed: true,
      reconstruct: 'always',
      maxProjectDistanceMm: 25
    });
    expect(geodesic.ok).toBe(true);
    if (!geodesic.ok) throw new Error(geodesic.message);
    expect(geodesic.path.samples.length).toBeGreaterThanOrEqual(4);
    // Chord-only may still succeed after densify, but geodesic must remain connected.
    expect(new Set(geodesic.path.samples.map((s) => s.componentId)).size).toBe(1);
    if (chord.ok) {
      expect(geodesic.path.samples.length).toBeGreaterThanOrEqual(chord.path.samples.length * 0.5);
    }
  });

  it('10: closure across curved region follows the surface', () => {
    const mesh = concaveCurvedArch(24);
    const c = 11.5;
    const seeds = seedHits(
      mesh,
      [
        [c - 5, c - 4, 20],
        [c + 5, c - 4, 20],
        [c + 5, c + 4, 20],
        [c - 5, c + 4, 20]
      ],
      25
    );
    const open = createSurfacePath(mesh, seeds, {
      closed: false,
      reconstruct: 'always',
      maxProjectDistanceMm: 25
    });
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    const closed = closeSurfacePath(mesh, open.path);
    expect(closed.ok).toBe(true);
    if (!closed.ok) throw new Error(closed.message);
    expect(closed.path.closed).toBe(true);
    const quality = measureSurfacePathQuality(closed.path);
    expect(quality.selfIntersectionCount).toBe(0);
    expect(quality.componentCount).toBe(1);
    expect(quality.enclosedRegionEstimate).toBeGreaterThan(0);
    expect(countSelfIntersections(closed.path)).toBe(0);
  });

  it('simplification preserves clinically meaningful corners', () => {
    const mesh = makeIndexedGrid(20, () => 0, 19);
    const built = createSurfacePath(
      mesh,
      [
        { point: [2, 2, 0] },
        { point: [10, 2, 0] },
        { point: [10, 10, 0] },
        { point: [2, 10, 0] }
      ],
      { closed: false, reconstruct: false, sampleMm: 0.2 }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const simplified = simplifySurfacePath(mesh, built.path, { maxDeviationMm: 0.15 });
    expect(simplified.samples.length).toBeGreaterThanOrEqual(4);
  });
});

describe('GEO-001C real upper STL regression', () => {
  it('normalized real upper accepts a local closed surface path without disconnected failure', () => {
    if (!existsSync(upperStl)) {
      expect(existsSync(upperStl)).toBe(true);
      return;
    }
    const buf = readFileSync(upperStl);
    const parsed = parseClinicalMeshBytes(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      'stl'
    );
    const raw = createMesh({
      id: 100,
      objectId: 'upper-raw',
      role: 'source',
      revision: 1,
      positions: parsed.positions,
      indices: parsed.indices,
      fingerprint: fingerprintMesh(parsed.positions, parsed.indices)
    });
    const { mesh } = normalizeMeshTopology(raw);
    const report = analyzeMesh(mesh);
    expect(report.connectedComponentCount).toBe(1);

    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    engine.buildSpatialIndex(mesh);
    const b = report.bbox;
    const cx = (b.min[0]! + b.max[0]!) / 2;
    const cy = (b.min[1]! + b.max[1]!) / 2;
    const cz = (b.min[2]! + b.max[2]!) / 2;
    const rawSeeds = [
      [cx - 3, cy - 2, cz + 12],
      [cx + 3, cy - 2, cz + 12],
      [cx + 3, cy + 2, cz + 12],
      [cx - 3, cy + 2, cz + 12],
      [cx - 3, cy - 2, cz + 12]
    ] as const;
    const seeds = [];
    for (const p of rawSeeds.slice(0, 4)) {
      const hit = projectPointToSurface(mesh, p, undefined, 40);
      expect(hit.hit).toBe(true);
      if (!hit.hit) return;
      seeds.push({ point: hit.point, faceId: hit.faceId });
    }
    const built = createSurfacePath(mesh, seeds, {
      closed: true,
      reconstruct: 'gaps',
      maxProjectDistanceMm: 30,
      maxJumpMm: 3
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      expect(built.message).not.toMatch(/disconnected scan surfaces/i);
      throw new Error(built.message);
    }
    const validated = validateSurfacePath(mesh, built.path, { maxSpacingMm: 40 });
    if (!validated.ok) {
      expect(validated.message).not.toMatch(/disconnected scan surfaces/i);
      throw new Error(validated.message);
    }
    const quality = measureSurfacePathQuality(built.path);
    expect(quality.componentCount).toBe(1);
    expect(quality.selfIntersectionCount).toBe(0);
  }, 180_000);
});
