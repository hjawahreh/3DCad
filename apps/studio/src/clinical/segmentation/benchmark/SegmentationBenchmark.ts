/**
 * Segmentation benchmark harness (UI-independent).
 * Reports preprocess / inference / postprocess / total / memory against identical fixtures.
 */

import { buildSyntheticDentalSurface } from '../../../geometry-kernel/mesh/MeshRegistry.js';
import { ReferenceHeuristicProvider } from '../provider/ReferenceHeuristicProvider.js';
import { OnnxSegmentationProvider } from '../provider/adapters/OnnxSegmentationProvider.js';
import { createDefaultSegmentationRegistry } from '../provider/SegmentationProviderRegistry.js';
import { detectInferenceRuntime } from '../provider/adapters/InferenceCapabilityDetector.js';

export interface SegmentationBenchmarkRow {
  readonly size: string;
  readonly model: string;
  readonly vertices: number;
  readonly triangles: number;
  readonly preprocessMs: number;
  readonly inferenceMs: number;
  readonly postprocessMs: number;
  readonly totalMs: number;
  readonly instances: number;
  readonly success: boolean;
  readonly failureRate: number;
  readonly peakMemoryEstimate: number;
  readonly semanticQuality: number | null;
  readonly instanceQuality: number | null;
  readonly identificationQuality: number | null;
  readonly boundaryQuality: number | null;
  readonly calibration: number | null;
  readonly notes: string;
}

export interface SegmentationModelComparisonRow {
  readonly model: string;
  readonly operational: boolean;
  readonly semanticQuality: string;
  readonly instanceQuality: string;
  readonly identificationQuality: string;
  readonly boundaryQuality: string;
  readonly inferenceTime: string;
  readonly memory: string;
  readonly failureRate: string;
  readonly calibration: string;
  readonly license: string;
  readonly runtime: string;
  readonly selectedDefault: boolean;
}

/** Smoke timings on synthetic fixtures — not CI gates. */
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
    let postprocessMs = 0;
    let faceMean: number | null = null;
    let instanceMean: number | null = null;
    let idMean: number | null = null;
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
      const t2 = performance.now();
      inferenceMs = t2 - t1;
      const finalized = await provider.postprocess(pred);
      postprocessMs = performance.now() - t2;
      instances = finalized.instances.length;
      faceMean = finalized.confidence.faceMean;
      instanceMean = finalized.confidence.instanceMean;
      idMean = finalized.confidence.identificationMean;
    } catch {
      success = false;
      inferenceMs = performance.now() - t1;
    }
    rows.push(
      Object.freeze({
        size: size.name,
        model: provider.info.modelId,
        vertices: Math.floor(mesh.positions.length / 3),
        triangles: Math.floor(mesh.indices.length / 3),
        preprocessMs: t1 - t0,
        inferenceMs,
        postprocessMs,
        totalMs: performance.now() - t0,
        instances,
        success,
        failureRate: success ? 0 : 1,
        peakMemoryEstimate: mesh.positions.byteLength + mesh.indices.byteLength,
        semanticQuality: faceMean,
        instanceQuality: instanceMean,
        identificationQuality: idMean,
        boundaryQuality: null,
        calibration: faceMean !== null && instanceMean !== null ? (faceMean + instanceMean) / 2 : null,
        notes: 'reference-heuristic CPU · identical synthetic fixture family'
      })
    );
  }
  provider.dispose();
  return Object.freeze(rows);
};

/**
 * Model comparison table for decision docs — research scaffolds report N/A until enabled.
 */
export const buildSegmentationModelComparison = async (): Promise<
  readonly SegmentationModelComparisonRow[]
> => {
  const runtime = await detectInferenceRuntime({ probeOnnx: true });
  const registry = createDefaultSegmentationRegistry();
  const smoke = await runSegmentationBenchmarkSmoke();
  const refAvgMs =
    smoke.reduce((s, r) => s + r.totalMs, 0) / Math.max(1, smoke.length);
  const refMem =
    smoke.reduce((s, r) => s + r.peakMemoryEstimate, 0) / Math.max(1, smoke.length);
  const refFail =
    smoke.reduce((s, r) => s + r.failureRate, 0) / Math.max(1, smoke.length);

  const onnx = new OnnxSegmentationProvider();
  await onnx.initialize();

  const rows: SegmentationModelComparisonRow[] = [
    Object.freeze({
      model: 'reference-heuristic (clinical-reference-seg)',
      operational: true,
      semanticQuality: 'fixture heuristic (mean face confidence recorded in smoke)',
      instanceQuality: 'connected-component separation on tooth faces',
      identificationQuality: 'FDI slot heuristic + threshold',
      boundaryQuality: 'adjacency refinement pass',
      inferenceTime: `${refAvgMs.toFixed(1)} ms avg (small/med/large synthetic)`,
      memory: `~${Math.round(refMem / 1024)} KiB mesh buffers (estimate)`,
      failureRate: `${(refFail * 100).toFixed(0)}% on smoke fixtures`,
      calibration: 'ConfidenceCalibrationTracker available; no fabricated scores',
      license: 'First-party CAD Studio',
      runtime: `CPU only · detected preferred EP ${runtime.preferred}`,
      selectedDefault: true
    }),
    Object.freeze({
      model: 'onnx-runtime (scaffold)',
      operational: false,
      semanticQuality: 'N/A — weights not licensed/bundled',
      instanceQuality: 'N/A',
      identificationQuality: 'N/A',
      boundaryQuality: 'N/A',
      inferenceTime: 'N/A',
      memory: 'N/A',
      failureRate: '100% (MODEL_UNAVAILABLE by design)',
      calibration: 'N/A',
      license: 'Runtime optional; weights gated',
      runtime: onnx.runtimeInformation().message,
      selectedDefault: false
    }),
    Object.freeze({
      model: 'MeshSegNet',
      operational: false,
      semanticQuality: 'Paper headline — not reproduced here',
      instanceQuality: 'Requires ONNX export + fixture eval',
      identificationQuality: 'Label map → FDI mapping TBD',
      boundaryQuality: 'Upstream graph-cut optional (pygco) — not in browser',
      inferenceTime: 'Not measured (Python/PyTorch upstream)',
      memory: 'Not measured',
      failureRate: 'N/A (scaffold)',
      calibration: 'Unknown',
      license: 'Code MIT; weights not redistributed; dataset not available upstream',
      runtime: 'PyTorch upstream → candidate for ONNX WebGPU/WASM/CPU',
      selectedDefault: false
    }),
    Object.freeze({
      model: 'TSegFormer',
      operational: false,
      semanticQuality: 'Paper headline — not reproduced',
      instanceQuality: 'N/A',
      identificationQuality: 'N/A',
      boundaryQuality: 'Geometry-guided loss (paper)',
      inferenceTime: 'N/A',
      memory: 'N/A',
      failureRate: 'N/A',
      calibration: 'Unknown',
      license: 'License/weights/dataset not cleared',
      runtime: 'PyTorch — not admissible in React clinical path',
      selectedDefault: false
    }),
    Object.freeze({
      model: 'TGNet / ToothGroupNetwork',
      operational: false,
      semanticQuality: 'N/A',
      instanceQuality: 'N/A',
      identificationQuality: 'N/A',
      boundaryQuality: 'N/A',
      inferenceTime: 'N/A',
      memory: 'N/A',
      failureRate: 'N/A',
      calibration: 'Unknown',
      license: 'SPDX/weights/dataset not cleared; external checkpoints',
      runtime: 'PyTorch',
      selectedDefault: false
    }),
    Object.freeze({
      model: 'DentalMAE',
      operational: false,
      semanticQuality: 'N/A',
      instanceQuality: 'N/A',
      identificationQuality: 'N/A',
      boundaryQuality: 'N/A',
      inferenceTime: 'N/A',
      memory: 'N/A',
      failureRate: 'N/A',
      calibration: 'Unknown',
      license: 'Code/weights not verified for redistribution',
      runtime: 'Research stack',
      selectedDefault: false
    })
  ];

  void registry;
  return Object.freeze(rows);
};
