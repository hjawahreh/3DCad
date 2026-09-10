/**
 * Shared scaffold for non-operational research providers.
 */

import type { TriangleMesh } from '../../../../geometry-kernel/mesh/TriangleMesh.js';
import { SegmentationError } from '../../errors.js';
import type { PreprocessResult } from '../../preprocess/SegmentationPreprocess.js';
import type {
  SegmentationInferRequest,
  SegmentationProvider,
  SegmentationProviderInfo
} from '../SegmentationProvider.js';

export const createScaffoldProvider = (
  info: SegmentationProviderInfo
): SegmentationProvider => ({
  info,
  async initialize() {
    /* intentional no-op until weights/runtime verified */
  },
  capabilities: () => info.capabilities,
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
});
