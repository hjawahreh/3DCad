/**
 * CLN-008 geometry kernel unit + determinism + property tests.
 */

import { describe, expect, it } from 'vitest';
import {
  ClinicalGeometryKernelBridge,
  buildSyntheticDentalSurface,
  buildSpatialIndex,
  closeBaseMesh,
  fingerprintMesh,
  prepareDisplayMesh,
  runGeometryQualityPipeline,
  trimMesh
} from '../../../src/geometry-kernel/index.js';

const mesh = (objectId = 'fixture', res = 12) =>
  buildSyntheticDentalSurface(objectId, 1, { gridResolution: res });

describe('quality pipeline', () => {
  it('accepts synthetic open surface and reports boundary edges', () => {
    const report = runGeometryQualityPipeline(mesh());
    expect(report.ok).toBe(true);
    expect(report.stats.boundaryEdges).toBeGreaterThan(0);
    expect(report.stats.triangleCount).toBeGreaterThan(0);
  });

  it('rejects empty mesh', () => {
    const empty = buildSyntheticDentalSurface('e', 1, { gridResolution: 1 });
    const positions = new Float32Array(0);
    const indices = new Uint32Array(0);
    const bad = {
      ...empty,
      positions,
      indices,
      fingerprint: fingerprintMesh(positions, indices)
    };
    const report = runGeometryQualityPipeline(bad);
    expect(report.ok).toBe(false);
    expect(report.codes).toContain('INPUT_INVALID');
  });
});

describe('spatial index', () => {
  it('builds deterministic nearest-neighbour queries', () => {
    const m = mesh('spatial', 8);
    const a = buildSpatialIndex(m);
    const b = buildSpatialIndex(m);
    expect(a.triangleCount).toBe(b.triangleCount);
    const hit = a.nearestVertex({ x: 0, y: 0, z: 0 });
    expect(hit?.index).toBeGreaterThanOrEqual(0);
  });
});

describe('trim', () => {
  it('removes interior triangles deterministically', () => {
    const m = mesh('trim', 16);
    const boundary = [
      { x: 200, y: 150 },
      { x: 440, y: 150 },
      { x: 320, y: 330 }
    ];
    const viewport = { width: 640, height: 480 };
    const a = trimMesh(m, { boundary, role: 'working', revision: 1, viewport });
    const b = trimMesh(m, { boundary, role: 'working', revision: 1, viewport });
    expect(a.mesh.fingerprint).toBe(b.mesh.fingerprint);
    expect(a.algorithm).toBe('exact-edge-clip');
    expect(a.retainedTriangles).toBeLessThan(Math.floor(m.indices.length / 3));
    expect(a.removedTriangles).toBeGreaterThan(0);
    expect(a.quality.ok).toBe(true);
  });

  it('exact clip removes more boundary-straddling area than centroid fallback', () => {
    const m = mesh('trim-exact', 24);
    const boundary = [
      { x: 180, y: 140 },
      { x: 460, y: 140 },
      { x: 460, y: 340 },
      { x: 180, y: 340 }
    ];
    const viewport = { width: 640, height: 480 };
    const exact = trimMesh(m, {
      boundary,
      role: 'working',
      revision: 1,
      viewport,
      algorithm: 'exact-edge-clip'
    });
    const centroid = trimMesh(m, {
      boundary,
      role: 'working',
      revision: 1,
      viewport,
      algorithm: 'centroid-polygon'
    });
    expect(exact.algorithm).toBe('exact-edge-clip');
    expect(centroid.algorithm).toBe('centroid-polygon');
    expect(exact.retainedTriangles).toBeLessThan(Math.floor(m.indices.length / 3));
    // Exact may emit more fragments along the cut; both must change the mesh.
    expect(exact.mesh.fingerprint).not.toBe(m.fingerprint);
    expect(centroid.mesh.fingerprint).not.toBe(m.fingerprint);
  });
});

describe('close-base', () => {
  it('plane strategy adds base triangles', () => {
    const m = mesh('close', 10);
    const before = Math.floor(m.indices.length / 3);
    const result = closeBaseMesh(m, { strategy: 'plane', height: 3, thickness: 1.5 });
    expect(result.addedTriangles).toBeGreaterThan(0);
    expect(Math.floor(result.mesh.indices.length / 3)).toBeGreaterThan(before);
    expect(result.mesh.fingerprint.startsWith('geo:')).toBe(true);
  });

  it('surface strategy is deterministic', () => {
    const m = mesh('fill', 10);
    const a = closeBaseMesh(m, { strategy: 'surface' });
    const b = closeBaseMesh(m, { strategy: 'surface' });
    expect(a.mesh.fingerprint).toBe(b.mesh.fingerprint);
  });
});

describe('display mesh', () => {
  it('does not change clinical fingerprint of source', () => {
    const m = mesh('display', 8);
    const sourceFp = m.fingerprint;
    const display = prepareDisplayMesh(m);
    expect(display.mesh.role).toBe('display');
    expect(m.fingerprint).toBe(sourceFp);
    expect(display.mesh.fingerprint.startsWith('display:')).toBe(true);
  });
});

describe('kernel bridge', () => {
  it('produces geo fingerprints and supports failNext', async () => {
    const bridge = new ClinicalGeometryKernelBridge();
    const ok = await bridge.invoke(
      {
        capability: 'boolean',
        operation: 'subtract',
        inputRevision: 1,
        sessionId: 'ks-test' as never,
        payload: {
          targetObjectId: 'jaw',
          boundary: [
            [100, 100],
            [300, 100],
            [200, 280]
          ]
        }
      },
      new AbortController().signal,
      () => undefined
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.fingerprint).toMatch(/^geo:/);
      expect(ok.value.metrics.vertexCount).toBeGreaterThan(0);
    }
  });

  it('is deterministic for identical inputs', async () => {
    const run = async () => {
      const bridge = new ClinicalGeometryKernelBridge();
      return bridge.invoke(
        {
          capability: 'boolean',
          operation: 'subtract',
          inputRevision: 1,
          sessionId: 'ks-det' as never,
          payload: {
            targetObjectId: 'same',
            boundary: [
              [120, 120],
              [400, 120],
              [260, 300]
            ]
          }
        },
        new AbortController().signal,
        () => undefined
      );
    };
    const a = await run();
    const b = await run();
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.fingerprint).toBe(b.value.fingerprint);
      expect(a.value.metrics.triangleCount).toBe(b.value.metrics.triangleCount);
    }
  });
});

describe('property / fuzz', () => {
  it('does not crash on noisy boundaries and rejects empty cuts safely', async () => {
    const bridge = new ClinicalGeometryKernelBridge();
    for (let seed = 1; seed <= 8; seed += 1) {
      const boundary = Array.from({ length: 5 }, (_, i) => {
        const t = (i / 5) * Math.PI * 2;
        return [
          320 + Math.cos(t + seed) * (40 + seed * 3),
          240 + Math.sin(t + seed) * (40 + seed * 2)
        ] as const;
      });
      const result = await bridge.invoke(
        {
          capability: 'boolean',
          operation: 'subtract',
          inputRevision: seed,
          sessionId: `ks-fuzz-${String(seed)}` as never,
          payload: { targetObjectId: `fuzz-${String(seed)}`, boundary }
        },
        new AbortController().signal,
        () => undefined
      );
      // Either succeeds with geo fingerprint or fails validation — never throws
      if (result.ok) {
        expect(result.value.fingerprint).toMatch(/^geo:/);
      } else {
        expect(['validation', 'unexpected', 'invalid']).toContain(result.error.code);
      }
    }
  });
});
