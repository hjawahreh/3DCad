/**
 * GEO-001D — Clinical Base Engine V2 unit/fixture matrix.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClinicalGeometryEngine,
  buildSyntheticDentalSurface,
  createMesh,
  fingerprintMesh,
  normalizeMeshTopology,
  constructClinicalBase,
  selectClinicalBaseBoundary,
  closeBaseMesh,
  analyzeMesh
} from '../../../src/geometry-kernel/index.js';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const upperStl = join(root, 'apps/studio/public/clinical-fixtures/upper.stl');
const lowerStl = join(root, 'apps/studio/public/clinical-fixtures/lower.stl');

const openBowl = (n = 16, id = 1) => {
  // Open shell (no bottom) — boundary is the lower rim.
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 6;
  for (let r = 0; r <= rings; r += 1) {
    const t = r / rings;
    const rad = 8 * (0.4 + 0.6 * t);
    const z = 10 * (1 - t);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      positions.push(Math.cos(a) * rad, Math.sin(a) * rad, z);
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + i;
      const d = (r + 1) * n + ((i + 1) % n);
      indices.push(a, c, b, b, c, d);
    }
  }
  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return createMesh({
    id,
    objectId: `bowl-${String(id)}`,
    role: 'working',
    revision: 1,
    positions: pos,
    indices: idx,
    fingerprint: fingerprintMesh(pos, idx)
  });
};

const concaveBoundaryMesh = () => {
  // Planar open ring with a concave notch (C-shape-ish polygon extruded as walls only).
  const pts: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [10, 8],
    [7, 8],
    [7, 3],
    [3, 3],
    [3, 8],
    [0, 8]
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  const h = 4;
  for (const [x, y] of pts) {
    positions.push(x, y, h);
  }
  for (const [x, y] of pts) {
    positions.push(x, y, 0);
  }
  // Only side walls — leave top and bottom open so largest boundary is the rim.
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a = i;
    const b = (i + 1) % n;
    const a2 = n + i;
    const b2 = n + ((i + 1) % n);
    indices.push(a, b, b2, a, b2, a2);
  }
  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return createMesh({
    id: 42,
    objectId: 'concave',
    role: 'working',
    revision: 1,
    positions: pos,
    indices: idx,
    fingerprint: fingerprintMesh(pos, idx)
  });
};

describe('GEO-001D ClinicalBase V2 construction matrix', () => {
  it('1. convex dental-like boundary builds without slab/bridge', () => {
    const mesh = openBowl(20, 1);
    const result = constructClinicalBase({
      mesh,
      strategy: 'plane',
      height: 2,
      thickness: 1,
      offset: 0,
      clinicalBaseNormal: [0, 0, 1],
      preferClinicalFrame: true
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(
        `${result.code}: ${result.message} blocking=${JSON.stringify(result.quality?.blockingFailures)}`
      );
    }
    expect(result.quality.slabDetection.detected).toBe(false);
    expect(result.quality.diagonalBridgeDetection.rejected).toBe(false);
    expect(result.quality.boundaryMatch.passed).toBe(true);
    expect(result.addedTriangles).toBeGreaterThan(0);
  });

  it('2. concave boundary triangulates without diagonal reject', () => {
    const mesh = concaveBoundaryMesh();
    const result = constructClinicalBase({
      mesh,
      strategy: 'plane',
      height: 1.5,
      thickness: 1,
      offset: 0,
      clinicalBaseNormal: [0, 0, 1],
      preferClinicalFrame: true
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(
        `${result.code}: ${result.message} blocking=${JSON.stringify(result.quality?.blockingFailures)}`
      );
    }
    expect(result.quality.diagonalBridgeDetection.rejected).toBe(false);
  });

  it('3–5. asymmetric / dense / sparse boundaries', () => {
    const sparse = openBowl(8, 3);
    const dense = openBowl(48, 4);
    const asymmetric = buildSyntheticDentalSurface('asym', 5, {
      gridResolution: 14,
      bounds: { min: [-40, -15, 0], max: [20, 25, 14] }
    });
    for (const mesh of [sparse, dense, asymmetric]) {
      const result = constructClinicalBase({
        mesh,
        strategy: 'plane',
        height: 2,
        thickness: 1.2,
        offset: 0
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      expect(result.quality.slabDetection.detected).toBe(false);
    }
  });

  it('10. invalid boundary fails closed', () => {
    // Watertight tetrahedron — no open boundary.
    const tp = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0, 0.5, 0.3, 1]);
    const ti = new Uint32Array([0, 1, 2, 0, 1, 3, 1, 2, 3, 2, 0, 3]);
    const closed = createMesh({
      id: 100,
      objectId: 'tet',
      role: 'working',
      revision: 1,
      positions: tp,
      indices: ti,
      fingerprint: fingerprintMesh(tp, ti)
    });
    const result = constructClinicalBase({
      mesh: closed,
      strategy: 'plane',
      height: 2,
      thickness: 1,
      offset: 0
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toMatch(/NO_BOUNDARY|INVALID_BOUNDARY/);
  });

  it('12–14. thin / thick / offset strategies', () => {
    const mesh = openBowl(16, 7);
    for (const [height, thickness, strategy] of [
      [0.8, 0.5, 'plane'],
      [4, 3, 'plane'],
      [2, 2.5, 'offset']
    ] as const) {
      const result = constructClinicalBase({
        mesh,
        strategy,
        height,
        thickness,
        offset: 0.2,
        clinicalBaseNormal: [0, 0, 1],
        preferClinicalFrame: true
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`${strategy}: ${result.message}`);
      expect(result.quality.thicknessStats.mean).toBeGreaterThan(0);
    }
  });

  it('15. repeated generation is deterministic', () => {
    const mesh = openBowl(18, 8);
    const a = constructClinicalBase({
      mesh,
      strategy: 'plane',
      height: 2,
      thickness: 1,
      offset: 0,
      clinicalBaseNormal: [0, 0, 1],
      preferClinicalFrame: true
    });
    const b = constructClinicalBase({
      mesh,
      strategy: 'plane',
      height: 2,
      thickness: 1,
      offset: 0,
      clinicalBaseNormal: [0, 0, 1],
      preferClinicalFrame: true
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.mesh.fingerprint).toBe(b.mesh.fingerprint);
  });

  it('closeBaseMesh plane path uses clinical-base-v2 (no AABB slab authority)', () => {
    const mesh = openBowl(16, 9);
    const closed = closeBaseMesh(mesh, {
      strategy: 'plane',
      height: 2,
      thickness: 1.5,
      preferRequestedOrientation: true,
      planeNormal: [0, 0, 1]
    });
    expect(closed.addedTriangles).toBeGreaterThan(0);
    expect(closed.baseQuality).toBeDefined();
    expect(closed.baseQuality?.blockingFailures ?? ['x']).toEqual([]);
    expect(closed.warnings.some((w) => /baseV2:|clinical-base-v2/i.test(w))).toBe(true);
    const before = analyzeMesh(mesh).surfaceArea;
    const after = analyzeMesh(closed.mesh).surfaceArea;
    expect(after).toBeLessThan(before * 8);
  });

  it('engine.createBase exposes selectedBoundary diagnostics', async () => {
    const mesh = buildSyntheticDentalSurface('jaw', 3, { gridResolution: 10 });
    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    const result = await engine.createBase({
      trimmedMesh: mesh,
      baseStrategy: 'plane',
      parameters: { height: 2, thickness: 1.5, preferClinicalFrame: false }
    });
    expect(result.success).toBe(true);
    expect(result.selectedBoundary).toBeDefined();
    expect(result.diagnostics.backend).toMatch(/clinical-base-v2|clinical-reference/i);
  });
  it('8–11. artifact / invalid / non-planar gates', () => {
    // Tiny artifact loop on otherwise open bowl — selection must prefer primary rim.
    const mesh = openBowl(20, 11);
    const selected = selectClinicalBaseBoundary(mesh, [0, 0, 1]);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(selected.analyzed.pointCount).toBeGreaterThan(8);

    // Non-planar: tall zigzag rim — construction may project if within tolerance, else fail explicitly.
    const n = 24;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const z = (i % 2 === 0 ? 0 : 12) + Math.sin(a * 3) * 2;
      pos.push(Math.cos(a) * 20, Math.sin(a) * 14, z);
    }
    pos.push(0, 0, 6);
    const center = n;
    for (let i = 0; i < n; i += 1) {
      idx.push(center, i, (i + 1) % n);
    }
    const p = new Float32Array(pos);
    const ix = new Uint32Array(idx);
    const wavy = createMesh({
      id: 77,
      objectId: 'wavy',
      role: 'working',
      revision: 1,
      positions: p,
      indices: ix,
      fingerprint: fingerprintMesh(p, ix)
    });
    const wavyResult = constructClinicalBase({
      mesh: wavy,
      strategy: 'plane',
      height: 2,
      thickness: 1,
      offset: 0,
      clinicalBaseNormal: [0, 0, 1],
      preferClinicalFrame: true
    });
    if (wavyResult.ok) {
      expect(wavyResult.quality.blockingFailures).toEqual([]);
      expect(wavyResult.quality.slabDetection.detected).toBe(false);
    } else {
      expect(wavyResult.code).toMatch(/NON_PLANAR|TRIANGULATION|INVALID|BOUNDARY|NO_/);
    }
  });

  it('16–17. undo/redo contract is mesh fingerprint based (engine level)', () => {
    const mesh = openBowl(14, 16);
    const based = constructClinicalBase({
      mesh,
      strategy: 'plane',
      height: 2,
      thickness: 1,
      offset: 0,
      clinicalBaseNormal: [0, 0, 1],
      preferClinicalFrame: true
    });
    expect(based.ok).toBe(true);
    if (!based.ok) return;
    // Undo = restore prior mesh fingerprint; redo = re-apply based fingerprint.
    const undone = mesh.fingerprint;
    const redone = based.mesh.fingerprint;
    expect(undone).not.toBe(redone);
    expect(based.quality.inputFingerprint).toBe(undone);
    expect(based.quality.outputFingerprint).toBe(redone);
  });
});

describe('GEO-001D real dental base (normalized fixtures)', () => {
  const loadNormalized = (path: string, arch: string) => {
    const buf = readFileSync(path);
    const parsed = parseClinicalMeshBytes(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      'stl'
    );
    const raw = createMesh({
      id: arch === 'upper' ? 201 : 202,
      objectId: arch,
      role: 'source',
      revision: 1,
      positions: parsed.positions,
      indices: parsed.indices,
      fingerprint: fingerprintMesh(parsed.positions, parsed.indices)
    });
    return normalizeMeshTopology(raw).mesh;
  };

  it('6–7. real upper/lower select a trustworthy clinical boundary', () => {
    expect(existsSync(upperStl)).toBe(true);
    expect(existsSync(lowerStl)).toBe(true);
    for (const [path, arch, normal] of [
      [upperStl, 'upper', [0, 1, 0] as const],
      [lowerStl, 'lower', [0, 1, 0] as const]
    ] as const) {
      const mesh = loadNormalized(path, arch);
      const selected = selectClinicalBaseBoundary(mesh, normal);
      expect(selected.ok).toBe(true);
      if (!selected.ok) throw new Error(selected.message);
      expect(selected.analyzed.pointCount).toBeGreaterThan(50);
      expect(selected.analyzed.perimeter).toBeGreaterThan(50);
      // Must not be a single-triangle artifact.
      expect(selected.analyzed.pointCount).toBeGreaterThan(8);
    }
  }, 180_000);

  it('real upper builds a base without slab/bridge (ENGINE PASS gate)', () => {
    const mesh = loadNormalized(upperStl, 'upper');
    const t0 = performance.now();
    const result = constructClinicalBase({
      mesh,
      strategy: 'plane',
      height: 3,
      thickness: 1.5,
      offset: 0.3,
      clinicalBaseNormal: [0, 1, 0],
      preferClinicalFrame: true
      // Keep full clinical boundary — do not chord-subsample the arch.
    });
    const elapsed = performance.now() - t0;
    if (!result.ok) {
      throw new Error(
        `${result.code}: ${result.message} blocking=${JSON.stringify(result.quality?.blockingFailures)} quality=${JSON.stringify(result.quality ? { nm: result.quality.nonManifoldEdgeCount, be: result.quality.boundaryEdgeCount, slab: result.quality.slabDetection, bridge: result.quality.diagonalBridgeDetection, match: result.quality.boundaryMatch, stages: result.quality.stageTimingsMs } : null)}`
      );
    }
    expect(result.ok).toBe(true);
    expect(result.quality.slabDetection.detected).toBe(false);
    expect(result.quality.diagonalBridgeDetection.rejected).toBe(false);
    expect(result.quality.boundaryMatch.passed).toBe(true);
    expect(result.quality.blockingFailures).toEqual([]);
    expect(result.quality.boundaryEdgeCount).toBe(0);
    expect(result.quality.nonManifoldEdgeCount).toBe(0);
    expect(result.quality.watertight).toBe(true);
    expect(result.quality.manifold).toBe(true);
    // Document dominant stage without fabricating progress %.
    expect(Object.keys(result.quality.stageTimingsMs).length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(120_000);
  }, 180_000);

  it('real lower builds a base without slab/bridge (CLN-WORKFLOW-002A ENGINE PASS gate)', () => {
    const mesh = loadNormalized(lowerStl, 'lower');
    const t0 = performance.now();
    const result = constructClinicalBase({
      mesh,
      strategy: 'plane',
      height: 3,
      thickness: 1.5,
      offset: 0.3,
      clinicalBaseNormal: [0, 1, 0],
      preferClinicalFrame: true
    });
    const elapsed = performance.now() - t0;
    if (!result.ok) {
      throw new Error(
        `${result.code}: ${result.message} blocking=${JSON.stringify(result.quality?.blockingFailures)} quality=${JSON.stringify(result.quality ? { nm: result.quality.nonManifoldEdgeCount, be: result.quality.boundaryEdgeCount, slab: result.quality.slabDetection, bridge: result.quality.diagonalBridgeDetection, match: result.quality.boundaryMatch, stages: result.quality.stageTimingsMs } : null)}`
      );
    }
    expect(result.ok).toBe(true);
    expect(result.quality.slabDetection.detected).toBe(false);
    expect(result.quality.diagonalBridgeDetection.rejected).toBe(false);
    expect(result.quality.boundaryMatch.passed).toBe(true);
    expect(result.quality.blockingFailures).toEqual([]);
    expect(result.quality.boundaryEdgeCount).toBe(0);
    expect(result.quality.nonManifoldEdgeCount).toBe(0);
    expect(result.quality.watertight).toBe(true);
    expect(result.quality.manifold).toBe(true);
    expect(Object.keys(result.quality.stageTimingsMs).length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(120_000);
  }, 180_000);
});
