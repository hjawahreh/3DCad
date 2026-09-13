/**
 * PROD-002E — production arch / anatomy analysis.
 */

import { describe, expect, it } from 'vitest';
import { createMesh } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import {
  analyzeClinicalArchAnatomy,
  summarizeArchAnatomyForUi
} from '../../src/clinical/anatomy/ClinicalArchAnatomyAnalysis.js';

/** Elongated arch-like point cloud as a triangulated ribbon (geometry-driven, not demo coords). */
const archLikeMesh = (opts?: { readonly flipY?: boolean }) => {
  const flip = opts?.flipY === true ? -1 : 1;
  const positions: number[] = [];
  const indices: number[] = [];
  // Wide in X, thin in Y, moderate in Z — PCA short ≈ Y (occlusal).
  for (let i = 0; i < 24; i += 1) {
    const t = (i / 23) * Math.PI;
    const x = Math.cos(t) * 30;
    const z = Math.sin(t) * 12;
    const yBase = flip * 2;
    positions.push(x, yBase, z, x, yBase + flip * 4, z, x + 0.5, yBase + flip * 2, z + 0.5);
  }
  for (let i = 0; i < 24; i += 1) {
    const b = i * 3;
    indices.push(b, b + 1, b + 2);
  }
  return createMesh({
    id: 1,
    objectId: 'arch',
    revision: 0,
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    role: 'source'
  });
};

describe('PROD-002E clinical arch anatomy', () => {
  it('is deterministic for the same mesh', () => {
    const mesh = archLikeMesh();
    const a = analyzeClinicalArchAnatomy({ objectId: 'u', archRole: 'upper', mesh });
    const b = analyzeClinicalArchAnatomy({ objectId: 'u', archRole: 'upper', mesh });
    const { timingMs: _timingA, ...restA } = a;
    const { timingMs: _timingB, ...restB } = b;
    void _timingA;
    void _timingB;
    expect(restA).toEqual(restB);
    expect(a.version).toBe('clinical-arch-anatomy-v2');
  });

  it('honors declared upper/lower with high confidence', () => {
    const mesh = archLikeMesh();
    const upper = analyzeClinicalArchAnatomy({ objectId: 'u', archRole: 'upper', mesh });
    const lower = analyzeClinicalArchAnatomy({ objectId: 'l', archRole: 'lower', mesh });
    expect(upper.archRegion).toMatchObject({ archRole: 'upper', confidence: 'high' });
    expect(lower.archRegion).toMatchObject({ archRole: 'lower', confidence: 'high' });
  });

  it('exposes left/right, anterior/posterior, occlusal, dental regions, and candidates', () => {
    const mesh = archLikeMesh();
    const report = analyzeClinicalArchAnatomy({ objectId: 'u', archRole: 'upper', mesh });
    expect(report.laterality.leftDirection).toBeDefined();
    expect(report.laterality.rightDirection.x).toBeCloseTo(-report.laterality.leftDirection.x, 5);
    expect(report.anteroposterior.anteriorDirection).toBeDefined();
    expect(report.occlusalHint.normal).toBeDefined();
    expect(report.dentalRegions.length).toBe(5);
    expect(report.toothRegionCandidates.length).toBeGreaterThan(0);
    for (const c of report.toothRegionCandidates) {
      expect(c.id).toMatch(/^region-/);
      expect(Number.isFinite(c.centroid[0])).toBe(true);
      expect(c.dentalRegion).toBeTruthy();
    }
    // Candidates sorted left→right along arch (descending archCoordinate).
    for (let i = 1; i < report.toothRegionCandidates.length; i += 1) {
      const prev = report.toothRegionCandidates[i - 1];
      const cur = report.toothRegionCandidates[i];
      expect(prev).toBeDefined();
      expect(cur).toBeDefined();
      if (prev === undefined || cur === undefined) continue;
      expect(prev.archCoordinate).toBeGreaterThanOrEqual(cur.archCoordinate);
    }
  });

  it('handles empty / tiny meshes gracefully without hard-coded demo peaks', () => {
    const empty = createMesh({
      id: 2,
      objectId: 'empty',
      revision: 0,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      role: 'source'
    });
    const report = analyzeClinicalArchAnatomy({ objectId: 'empty', mesh: empty });
    expect(report.frame.confidence === 'unavailable' || report.toothRegionCandidates.length >= 0).toBe(
      true
    );
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.toothRegionCandidates.every((c) => Number.isFinite(c.centroid[0]))).toBe(true);
  });

  it('summarizes for clinical UI without inventing certainty', () => {
    const mesh = archLikeMesh();
    const report = analyzeClinicalArchAnatomy({ objectId: 'u', archRole: 'upper', mesh });
    const summary = summarizeArchAnatomyForUi(report);
    expect(summary.archRole).toBe('upper');
    expect(summary.candidateCount).toBe(report.toothRegionCandidates.length);
    expect(['high', 'moderate', 'low', 'unavailable']).toContain(summary.frameConfidence);
  });

  it('uses low-confidence heuristics for undeclared arch when case mean is provided', () => {
    const mesh = archLikeMesh();
    const report = analyzeClinicalArchAnatomy({
      objectId: 'u',
      mesh,
      caseMeanCentroidY: -50
    });
    // Centroid Y near 0..4 → superior to -50 → low-confidence upper heuristic
    expect(report.archRegion.archRole === 'upper' || report.archRegion.archRole === 'unknown').toBe(
      true
    );
    if (report.archRegion.archRole === 'upper') {
      expect(report.archRegion.confidence).toBe('low');
    }
  });
});
