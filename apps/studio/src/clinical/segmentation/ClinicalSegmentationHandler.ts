/**
 * Operation Runtime handler for kind 'segmentation'.
 */

import {
  opFailure,
  opSuccess,
  type CommandIntent,
  type KernelRequest,
  type KernelSuccess,
  type OperationHandler,
  type OperationHandlerContext,
  type OperationResult
} from '@cad-studio/tool-runtime';

export const createClinicalSegmentationOperationHandler = (): OperationHandler => ({
  kind: 'segmentation',
  onStart(_session, params) {
    if (typeof params.targetObjectId !== 'string') {
      return opFailure('validation', 'Segmentation requires a target object');
    }
    if (typeof params.providerId !== 'string') {
      return opFailure('validation', 'Segmentation requires a provider');
    }
    return opSuccess(undefined);
  },
  buildKernelRequest(session: OperationHandlerContext): OperationResult<KernelRequest> {
    // Segmentation inference is provider-owned; Operation Runtime still gates commit.
    // Kernel request records metadata via topology/validation capability (no mesh mutation).
    return opSuccess({
      operation: 'segmentation',
      inputRevision: session.baseRevision,
      payload: Object.freeze({
        family: 'topology',
        geometryOperation: 'components',
        targetObjectId: session.params.targetObjectId,
        providerId: session.params.providerId,
        predictionId: session.params.predictionId,
        instanceCount: session.params.instanceCount,
        fingerprint: session.params.fingerprint
      })
    });
  },
  validate(session: OperationHandlerContext, kernel: KernelSuccess | undefined) {
    if (kernel === undefined) {
      return opFailure('validation', 'Segmentation kernel result required');
    }
    if (kernel.fingerprint.length === 0) {
      return opFailure('validation', 'Segmentation fingerprint missing');
    }
    if (typeof session.params.predictionId !== 'string') {
      return opFailure('validation', 'Accepted prediction id required');
    }
    return opSuccess(undefined);
  },
  buildCommandIntent(session: OperationHandlerContext, kernel: KernelSuccess | undefined) {
    if (kernel === undefined) {
      return opFailure('validation', 'Cannot build segmentation intent without kernel result');
    }
    const intent: CommandIntent = Object.freeze({
      name: 'segmentation.commit',
      operationId: session.id,
      operationKind: 'segmentation',
      baseRevision: session.baseRevision,
      payload: Object.freeze({
        params: session.params,
        kernel: kernel.payload,
        fingerprint: kernel.fingerprint
      }),
      kernelFingerprint: kernel.fingerprint,
      undoable: true
    });
    return opSuccess(intent);
  }
});
