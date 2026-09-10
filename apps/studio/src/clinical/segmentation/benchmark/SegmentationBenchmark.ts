/**
 * Lightweight segmentation benchmark harness (UI-independent).
 */

import { buildSyntheticDentalSurface } from '../../../geometry-kernel/mesh/MeshRegistry.js';
import { ReferenceHeuristicProvider } from '../provider/ReferenceHeuristicProvider.js';

export interface SegmentationBenchmarkRow {
  readonly size: string;
  readonly vertices: number;
  readonly triangles: number;
  readonly preprocessMs: number;
  readonly inferenceMs: number;
  readonly totalMs: number;
  readonly instances: number;
  readonly success: boolean;
  readonly peakMemoryEstimate: number;
}

export const runSegmentationBenchmarkSmoke = async (): Promise<
  readonly SegmentationBenchmarkRow[]
> => {
  const sizes = [
    { name: 'small', res: 8 },
    { name: 'medium', res: 24 },
    { name: 'large', res: 40 }
  ] as const;
  const provider = new ReferenceHeuristicProvider();
  await provider.initialize();
  const rows: SegmentationBenchmarkRow[] = [];
  for (const size of sizes) {
    const mesh = buildSyntheticDentalSurface(size.name, 1, { gridResolution: size.res });
    const t0 = performance.now();
    const preprocess = await provider.preprocess(mesh, new AbortController().signal);
    const t1 = performance.now();
    let success = true;
    let instances = 0;
    let inferenceMs = 0;
    try {
      const pred = await provider.infer({
        objectId: size.name,
        sourceRevision: mesh.revision,
        geometryFingerprint: mesh.fingerprint,
        mesh,
        preprocess,
        identificationThreshold: 0.65,
        signal: new AbortController().signal,
        report: () => undefined
      });
      inferenceMs = performance.now() - t1;
      instances = pred.instances.length;
    } catch {
      success = false;
      inferenceMs = performance.now() - t1;
    }
    rows.push(
      Object.freeze({
        size: size.name,
        vertices: Math.floor(mesh.positions.length / 3),
        triangles: Math.floor(mesh.indices.length / 3),
        preprocessMs: t1 - t0,
        inferenceMs,
        totalMs: performance.now() - t0,
        instances,
        success,
        peakMemoryEstimate: mesh.positions.byteLength + mesh.indices.byteLength
      })
    );
  }
  provider.dispose();
  return Object.freeze(rows);
};
