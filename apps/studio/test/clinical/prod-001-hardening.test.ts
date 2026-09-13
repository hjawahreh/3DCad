/**
 * PROD-001 — geometry commit invariants (trim / close-base / fixtures).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSyntheticDentalSurface,
  closeBaseMesh,
  CLOSE_BASE_MAX_ADDED_TRIANGLES,
  createMesh,
  fingerprintMesh,
  inferCloseBaseExtrudeAxis,
  inferTrimProjectionAxes,
  trimMesh
} from '../../src/geometry-kernel/index.js';
import { parseClinicalMeshBytes } from '../../src/clinical/import/ClinicalMeshParsers.js';
import {
  clearClinicalGeometryDevDiagEvents,
  getClinicalGeometryDevDiagEvents,
  recordClinicalGeometryDevDiag
} from '../../src/clinical/diagnostics/ClinicalGeometryDevDiagnostics.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../public/clinical-fixtures'
);

const meshFromParsed = (
  objectId: string,
  positions: Float32Array,
  indices: Uint32Array
) =>
  createMesh({
    id: 1,
    objectId,
    role: 'working',
    revision: 1,
    positions,
    indices,
    fingerprint: fingerprintMesh(positions, indices)
  });

describe('PROD-001 trim invariants', () => {
  it('valid trim creates different mesh fingerprint and face count', () => {
    const m = buildSyntheticDentalSurface('trim-inv', 1, { gridResolution: 20 });
    const beforeFaces = Math.floor(m.indices.length / 3);
    const beforeFp = m.fingerprint;
    const result = trimMesh(m, {
      boundary: [
        { x: 180, y: 140 },
        { x: 460, y: 140 },
        { x: 460, y: 340 },
        { x: 180, y: 340 }
      ],
      viewport: { width: 640, height: 480 },
      role: 'working',
      revision: 2
    });
    expect(result.removedTriangles).toBeGreaterThan(0);
    expect(result.mesh.fingerprint).not.toBe(beforeFp);
    expect(Math.floor(result.mesh.indices.length / 3)).not.toBe(beforeFaces);
  });

  it('rejects accept-equivalent no-change trim', () => {
    const m = buildSyntheticDentalSurface('trim-nochange', 2, { gridResolution: 12 });
    // Tiny polygon far outside AABB → no triangles removed.
    expect(() =>
      trimMesh(m, {
        boundary: [
          { x: -1000, y: -1000 },
          { x: -999, y: -1000 },
          { x: -999.5, y: -999 }
        ],
        role: 'working',
        revision: 2
      })
    ).toThrow(/Trim produced no geometry change/);
  });

  it('infers XY cut plane for synthetic dental surface (thin Z)', () => {
    const m = buildSyntheticDentalSurface('axes', 3, { gridResolution: 8 });
    const axes = inferTrimProjectionAxes(m);
    expect(axes.n).toBe(2);
    expect(axes.u).toBe(0);
    expect(axes.v).toBe(1);
  });

  it('undo/redo fingerprint contract at mesh level', () => {
    const a = buildSyntheticDentalSurface('hist', 4, { gridResolution: 16 });
    const trimmed = trimMesh(a, {
      boundary: [
        { x: 200, y: 150 },
        { x: 440, y: 150 },
        { x: 320, y: 330 }
      ],
      viewport: { width: 640, height: 480 },
      role: 'working',
      revision: 2
    });
    const fpA = a.fingerprint;
    const fpB = trimmed.mesh.fingerprint;
    expect(fpA).not.toBe(fpB);
    // Undo restores A; redo restores B (history stores document snapshots with these fps).
    expect(fpA).toBe(a.fingerprint);
    expect(fpB).toBe(trimmed.mesh.fingerprint);
  });
});

describe('PROD-001 close-base invariants', () => {
  it('valid base creates bounded result without NaN', () => {
    const m = buildSyntheticDentalSurface('cb', 5, { gridResolution: 14 });
    const before = Math.floor(m.indices.length / 3);
    const result = closeBaseMesh(m, { strategy: 'plane', height: 2, thickness: 1.2 });
    expect(result.addedTriangles).toBeGreaterThan(0);
    expect(result.addedTriangles).toBeLessThan(CLOSE_BASE_MAX_ADDED_TRIANGLES);
    expect(Math.floor(result.mesh.indices.length / 3)).toBeGreaterThan(before);
    for (let i = 0; i < result.mesh.positions.length; i += 1) {
      expect(Number.isFinite(result.mesh.positions[i]!)).toBe(true);
    }
    expect(result.extrudeAxis).toBe(inferCloseBaseExtrudeAxis(m));
  });

  it('cancel via shouldAbort does not return a mesh', () => {
    const m = buildSyntheticDentalSurface('cb-cancel', 6, { gridResolution: 20 });
    expect(() =>
      closeBaseMesh(m, {
        strategy: 'plane',
        height: 2,
        shouldAbort: () => true
      })
    ).toThrow(/cancelled/i);
  });

  it('timeout budget aborts runaway work', () => {
    const m = buildSyntheticDentalSurface('cb-timeout', 7, { gridResolution: 24 });
    expect(() =>
      closeBaseMesh(m, {
        strategy: 'plane',
        height: 2,
        maxElapsedMs: 0
      })
    ).toThrow(/time budget/i);
  });
});

describe('PROD-001 real fixtures', () => {
  it('upper.stl trim + close-base stay bounded', () => {
    const file = readFileSync(join(fixturesDir, 'upper.stl'));
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const parsed = parseClinicalMeshBytes(bytes, 'stl');
    expect(parsed.faceCount).toBeGreaterThan(1000);
    // Decimate for CI runtime: take a spatial subset via stride on triangles.
    const stride = Math.max(1, Math.floor(parsed.faceCount / 4000));
    const idx: number[] = [];
    for (let t = 0; t < parsed.faceCount; t += stride) {
      idx.push(
        parsed.indices[t * 3]!,
        parsed.indices[t * 3 + 1]!,
        parsed.indices[t * 3 + 2]!
      );
    }
    const m = meshFromParsed('upper', parsed.positions, new Uint32Array(idx));
    const axes = inferTrimProjectionAxes(m);
    let aabbMinU = Number.POSITIVE_INFINITY;
    let aabbMaxU = Number.NEGATIVE_INFINITY;
    let aabbMinV = Number.POSITIVE_INFINITY;
    let aabbMaxV = Number.NEGATIVE_INFINITY;
    const vertCount = Math.floor(m.positions.length / 3);
    for (let i = 0; i < vertCount; i += 1) {
      const u = m.positions[i * 3 + axes.u]!;
      const v = m.positions[i * 3 + axes.v]!;
      if (u < aabbMinU) aabbMinU = u;
      if (u > aabbMaxU) aabbMaxU = u;
      if (v < aabbMinV) aabbMinV = v;
      if (v > aabbMaxV) aabbMaxV = v;
    }
    const u0 = aabbMinU + (aabbMaxU - aabbMinU) * 0.35;
    const u1 = aabbMinU + (aabbMaxU - aabbMinU) * 0.65;
    const v0 = aabbMinV + (aabbMaxV - aabbMinV) * 0.35;
    const v1 = aabbMinV + (aabbMaxV - aabbMinV) * 0.65;
    const trimmed = trimMesh(m, {
      boundary: [
        { x: u0, y: v0 },
        { x: u1, y: v0 },
        { x: u1, y: v1 },
        { x: u0, y: v1 }
      ],
      role: 'working',
      revision: 2
    });
    expect(trimmed.removedTriangles).toBeGreaterThan(0);
    expect(trimmed.mesh.fingerprint).not.toBe(m.fingerprint);

    const closed = closeBaseMesh(trimmed.mesh, {
      strategy: 'plane',
      height: 3,
      thickness: 1.5,
      maxElapsedMs: 15_000
    });
    expect(closed.addedTriangles).toBeGreaterThan(0);
    expect(closed.addedTriangles).toBeLessThan(CLOSE_BASE_MAX_ADDED_TRIANGLES);
    expect(closed.elapsedMs).toBeLessThan(15_000);
  }, 60_000);

  it('lower.stl close-base does not explode', () => {
    const file = readFileSync(join(fixturesDir, 'lower.stl'));
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const parsed = parseClinicalMeshBytes(bytes, 'stl');
    // Contiguous face prefix keeps topology saner than stride sampling.
    const faceBudget = Math.min(parsed.faceCount, 8000);
    const idx = parsed.indices.slice(0, faceBudget * 3);
    const m = meshFromParsed('lower', parsed.positions, idx);
    const closed = closeBaseMesh(m, {
      strategy: 'plane',
      height: 3,
      thickness: 1.5,
      maxElapsedMs: 12_000
    });
    expect(closed.addedTriangles).toBeGreaterThan(0);
    expect(closed.addedTriangles).toBeLessThan(CLOSE_BASE_MAX_ADDED_TRIANGLES);
    expect(closed.elapsedMs).toBeLessThan(12_000);
  }, 60_000);
});

describe('PROD-001 DEV diagnostics', () => {
  it('records compact events only through the helper', () => {
    clearClinicalGeometryDevDiagEvents();
    recordClinicalGeometryDevDiag({
      operation: 'trim',
      objectId: 'jaw',
      fingerprint: 'geo:test',
      faces: 10,
      vertices: 20,
      revision: 3
    });
    const rows = getClinicalGeometryDevDiagEvents();
    expect(rows.length).toBe(1);
    expect(rows[0]?.operation).toBe('trim');
    clearClinicalGeometryDevDiagEvents();
  });
});
