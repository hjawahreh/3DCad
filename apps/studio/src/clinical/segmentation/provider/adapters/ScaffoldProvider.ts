/**
 * Shared scaffold for non-operational research providers.
 */

import type { TriangleMesh } from '../../../../geometry-kernel/mesh/TriangleMesh.js';
import { SegmentationError } from '../../errors.js';
import type { PreprocessResult } from '../../preprocess/SegmentationPreprocess.js';
import type {
  SegmentationInferRequest,
  SegmentationProvider,
  SegmentationProviderInfo,
  SegmentationProviderRuntimeInfo
} from '../SegmentationProvider.js';
import { detectInferenceRuntime } from './InferenceCapabilityDetector.js';

export const createScaffoldProvider = (
  info: SegmentationProviderInfo
): SegmentationProvider => {
  let runtime: SegmentationProviderRuntimeInfo = Object.freeze({
    preferredExecutionProvider: 'cpu',
    availableExecutionProviders: Object.freeze(['cpu'] as const),
    message: 'Not initialized',
    gpuAvailable: false,
    cpuFallback: true
  });

  return {
    info,
    async initialize() {
      const snap = await detectInferenceRuntime({ probeOnnx: false });
      runtime = Object.freeze({
        preferredExecutionProvider: snap.preferred,
        availableExecutionProviders: snap.available,
        message: `${info.id} scaffold · ${snap.message}`,
        gpuAvailable: snap.webgpu,
        cpuFallback: true
      });
    },
    capabilities: () => info.capabilities,
    modelInformation: () => info,
    runtimeInformation: () => runtime,
    validateInput: () => ({
      ok: false,
      message: `${info.displayName} is not operational — weights/runtime/license not verified`
    }),
    async preprocess(_mesh: TriangleMesh, _signal: AbortSignal): Promise<PreprocessResult> {
      throw new SegmentationError(
        'MODEL_UNAVAILABLE',
        `${info.id} preprocess unavailable until model is verified`
      );
    },
    async infer(_request: SegmentationInferRequest) {
      throw new SegmentationError(
        'MODEL_UNAVAILABLE',
        `${info.id} inference unavailable until model weights, runtime, and license are verified`
      );
    },
    cancel() {
      /* no-op */
    },
    dispose() {
      /* no-op */
    }
  };
};
