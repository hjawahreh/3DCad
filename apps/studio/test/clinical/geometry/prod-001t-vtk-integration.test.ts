/**
 * PROD-001T — loop3d / keepMode / hybrid VTK wiring tests.
 */

import { describe, expect, it } from 'vitest';
import {
  buildClinicalTrimLoop3d,
  keepModeToVtkInsideOut,
  computeNewellNormal,
  loop3dSelfIntersects
} from '../../../src/clinical/trim/ClinicalTrimLoop3d.js';
import {
  HybridGeometryBackend,
  normalizeTrimKeepMode,
  probeVtkHttpWorker
} from '../../../src/geometry-kernel/index.js';

describe('PROD-001T clinical loop3d', () => {
  it('builds Newell normal from world picks and maps KEEP_OUTSIDE → InsideOut false', () => {
    const built = buildClinicalTrimLoop3d(
      [
        { x: 0, y: 0, worldX: 0, worldY: 0, worldZ: 0 },
        { x: 1, y: 0, worldX: 10, worldY: 0, worldZ: 0 },
        { x: 1, y: 1, worldX: 10, worldY: 10, worldZ: 0 },
        { x: 0, y: 1, worldX: 0, worldY: 10, worldZ: 0 }
      ],
      'KEEP_OUTSIDE'
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.normal[2]).toBeCloseTo(1, 5);
    expect(keepModeToVtkInsideOut(built.value.keepMode)).toBe(false);
    expect(normalizeTrimKeepMode('remove-interior')).toBe('KEEP_OUTSIDE');
    expect(normalizeTrimKeepMode('KEEP_INSIDE')).toBe('KEEP_INSIDE');
  });

  it('rejects missing world coordinates and unstable normals', () => {
    const missing = buildClinicalTrimLoop3d([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ]);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.message).toMatch(/3D boundary/i);

    const collinear = computeNewellNormal([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 }
    ]);
    expect(collinear).toBeUndefined();
  });

  it('detects self-intersecting bowtie loops without flagging adjacent edges', () => {
    const normal: [number, number, number] = [0, 0, 1];
    const bowtie = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }
    ];
    expect(loop3dSelfIntersects(bowtie, normal)).toBe(true);
    const square = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 }
    ];
    expect(loop3dSelfIntersects(square, normal)).toBe(false);
  });
});

describe('PROD-001T hybrid backend', () => {
  it('starts with reference sync path and reports vtk health separately', async () => {
    const hybrid = new HybridGeometryBackend();
    expect(hybrid.name).toBe('hybrid-vtk-reference-v1');
    expect(hybrid.vtkAvailable).toBe(false);
    const healthy = await probeVtkHttpWorker();
    hybrid.setVtkHealthy(healthy);
    expect(hybrid.vtkAvailable).toBe(healthy);
  });
});
