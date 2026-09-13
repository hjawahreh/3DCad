/**
 * ONNX Runtime Web segmentation provider scaffold (Phase 7).
 *
 * - Adapter-only; clinical UI never imports tensor runtimes.
 * - operational: false until licensed weights + optional runtime are verified.
 * - Reports WebGPU / WASM / CPU capability without silently switching default provider.
 *
 * Weights must never be bundled without license review
 * (see docs/architecture/model-licensing.md).
 */

import type { TriangleMesh } from '../../../../geometry-kernel/mesh/TriangleMesh.js';
import { SegmentationError } from '../../errors.js';
import {
  preprocessSegmentationMesh,
  type PreprocessResult
} from '../../preprocess/SegmentationPreprocess.js';
import { planLargeMeshSampling } from '../../preprocess/LargeMeshSampling.js';
import type { SegmentationPrediction } from '../../prediction/types.js';
import type {
  SegmentationInferRequest,
  SegmentationProvider,
  SegmentationProviderCapability,
  SegmentationProviderInfo,
  SegmentationProviderRuntimeInfo
} from '../SegmentationProvider.js';
import { detectInferenceRuntime } from './InferenceCapabilityDetector.js';

export interface OnnxSegmentationProviderOptions {
  /** Absolute or app-relative URL to a license-cleared .onnx file. */
  readonly modelUrl?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly displayName?: string;
}

/**
 * Production-shaped ONNX provider. Remains non-operational without:
 * 1) optional ONNX runtime enablement
 * 2) license-cleared model weights reachable at modelUrl
 */
export class OnnxSegmentationProvider implements SegmentationProvider {
  public readonly info: SegmentationProviderInfo;
  private cancelled = false;
  private initialized = false;
  private runtime: SegmentationProviderRuntimeInfo = Object.freeze({
    preferredExecutionProvider: 'cpu',
    availableExecutionProviders: Object.freeze(['cpu'] as const),
    message: 'Not initialized',
    gpuAvailable: false,
    cpuFallback: true
  });
  private readonly modelUrl: string | undefined;

  public constructor(options: OnnxSegmentationProviderOptions = {}) {
    this.modelUrl = options.modelUrl;
    const hasWeightsConfig = typeof options.modelUrl === 'string' && options.modelUrl.length > 0;
    this.info = Object.freeze({
      id: 'onnx-runtime',
      displayName: options.displayName ?? 'ONNX Runtime Segmentation (scaffold)',
      modelId: options.modelId ?? 'onnx-seg-pending',
      modelVersion: options.modelVersion ?? '0.0.0-scaffold',
      operational: false,
      licenseNotes:
        'Weights not bundled. Enable only after model-licensing.md clearance. ' +
        (hasWeightsConfig
          ? `Configured modelUrl=${options.modelUrl}`
          : 'No modelUrl configured.'),
      capabilities: Object.freeze([
        'semantic',
        'instance',
        'identification',
        'gpu',
        'cpu',
        'cancel'
      ] as SegmentationProviderCapability[])
    });
  }

  public async initialize(): Promise<void> {
    this.cancelled = false;
    const snap = await detectInferenceRuntime({ probeOnnx: true });
    const weightNote =
      this.modelUrl === undefined || this.modelUrl.length === 0
        ? 'no license-cleared modelUrl'
        : `modelUrl pending license enablement (${this.modelUrl})`;
    this.runtime = Object.freeze({
      preferredExecutionProvider: snap.preferred,
      availableExecutionProviders: snap.available,
      message: `${snap.message} · ${weightNote}`,
      gpuAvailable: snap.webgpu,
      cpuFallback: true
    });
    this.initialized = true;
  }

  public capabilities(): readonly SegmentationProviderCapability[] {
    return this.info.capabilities;
  }

  public modelInformation(): SegmentationProviderInfo {
    return this.info;
  }

  public runtimeInformation(): SegmentationProviderRuntimeInfo {
    return this.runtime;
  }

  public validateInput(mesh: TriangleMesh): { readonly ok: boolean; readonly message?: string } {
    if (!this.initialized) {
      return { ok: false, message: 'ONNX provider not initialized' };
    }
    if (Math.floor(mesh.indices.length / 3) === 0) {
      return { ok: false, message: 'Empty mesh' };
    }
    return {
      ok: false,
      message:
        'ONNX segmentation is not operational — model weights/runtime/license not verified. Use reference-heuristic or Adjust provider.'
    };
  }

  public async preprocess(mesh: TriangleMesh, signal: AbortSignal): Promise<PreprocessResult> {
    const result = await preprocessSegmentationMesh(mesh, { signal });
    // Exercise sampling plan so Model Input → Source Face mapping is ready for NN inputs.
    void planLargeMeshSampling(result);
    return result;
  }

  public async postprocess(prediction: SegmentationPrediction): Promise<SegmentationPrediction> {
    return prediction;
  }

  public async infer(_request: SegmentationInferRequest): Promise<never> {
    if (this.cancelled || _request.signal.aborted) {
      throw new SegmentationError('CANCELLED', 'ONNX inference cancelled');
    }
    _request.report({ completed: 0, total: 3, message: 'Loading segmentation model…' });
    throw new SegmentationError(
      'MODEL_UNAVAILABLE',
      `onnx-runtime inference unavailable: ${this.runtime.message}`
    );
  }

  public cancel(): void {
    this.cancelled = true;
  }

  public dispose(): void {
    this.cancelled = true;
    this.initialized = false;
  }
}
