/**
 * CLN-008 clinical geometry benchmark smoke (non-gating timings).
 */

import { describe, expect, it } from 'vitest';
import {
  ClinicalGeometryKernelBridge,
  buildSyntheticDentalSurface,
  buildSpatialIndex,
  closeBaseMesh,
  prepareDisplayMesh,
  runGeometryQualityPipeline,
  trimMesh
} from '../../../src/geometry-kernel/index.js';

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
};

const bench = (label: string, fn: () => void, iterations = 5) => {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return {
    label,
    median: percentile(samples, 50),
    p95: percentile(samples, 95),
    samples
  };
};

describe('clinical geometry benchmarks (smoke)', () => {
  it('records median/p95 for small/medium/large synthetic scans', () => {
    const sizes = [
      { name: 'small', res: 8 },
      { name: 'medium', res: 24 },
      { name: 'large', res: 48 }
    ] as const;
    const rows: Array<Record<string, number | string>> = [];
    for (const size of sizes) {
      const m = buildSyntheticDentalSurface(size.name, 1, { gridResolution: size.res });
      const verts = Math.floor(m.positions.length / 3);
      const tris = Math.floor(m.indices.length / 3);
      const preprocess = bench(`${size.name}.preprocess`, () => {
        runGeometryQualityPipeline(m, { buildSpatial: false });
      });
      const spatial = bench(`${size.name}.spatial`, () => {
        buildSpatialIndex(m);
      });
      const trim = bench(`${size.name}.trim`, () => {
        trimMesh(m, {
          boundary: [
            { x: 160, y: 140 },
            { x: 480, y: 140 },
            { x: 320, y: 340 }
          ],
          viewport: { width: 640, height: 480 }
        });
      });
      const close = bench(`${size.name}.closeBase`, () => {
        closeBaseMesh(m, { strategy: 'plane', height: 2, thickness: 1.5 });
      });
      const display = bench(`${size.name}.display`, () => {
        prepareDisplayMesh(m);
      });
      rows.push({
        size: size.name,
        vertices: verts,
        triangles: tris,
        preprocessMedianMs: Number(preprocess.median.toFixed(3)),
        preprocessP95Ms: Number(preprocess.p95.toFixed(3)),
        spatialMedianMs: Number(spatial.median.toFixed(3)),
        trimMedianMs: Number(trim.median.toFixed(3)),
        closeBaseMedianMs: Number(close.median.toFixed(3)),
        displayMedianMs: Number(display.median.toFixed(3)),
        peakMemoryEstimate: m.positions.byteLength + m.indices.byteLength
      });
    }
    // Smoke only — do not gate CI on absolute timings.
    expect(rows.length).toBe(3);
    expect(rows.every((r) => Number(r.triangles) > 0)).toBe(true);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ benchmark: 'CLN-008', rows }, null, 2));
  });

  it('kernel bridge trim+close smoke', async () => {
    const bridge = new ClinicalGeometryKernelBridge();
    const signal = new AbortController().signal;
    const trim = await bridge.invoke(
      {
        capability: 'boolean',
        operation: 'subtract',
        inputRevision: 1,
        sessionId: 'bench-trim' as never,
        payload: {
          targetObjectId: 'bench',
          boundary: [
            [100, 100],
            [500, 100],
            [300, 400]
          ],
          viewport: { width: 640, height: 480 }
        }
      },
      signal,
      () => undefined
    );
    expect(trim.ok).toBe(true);
    const close = await bridge.invoke(
      {
        capability: 'offset',
        operation: 'uniform',
        inputRevision: 2,
        sessionId: 'bench-close' as never,
        payload: { targetObjectId: 'bench', strategy: 'plane', height: 2, thickness: 1.5 }
      },
      signal,
      () => undefined
    );
    expect(close.ok).toBe(true);
  });
});
