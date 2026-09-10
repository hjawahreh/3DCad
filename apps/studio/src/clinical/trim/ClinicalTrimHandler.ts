/**
 * ClinicalTrimHandler — Operation Runtime handler for kind 'trim'.
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
import { MIN_BOUNDARY_POINTS } from './ClinicalTrimBoundaryMath.js';

export const createClinicalTrimOperationHandler = (): OperationHandler => ({
  kind: 'trim',
  onStart(_session, params) {
    const stroke = params.stroke;
    if (!Array.isArray(stroke) || stroke.length < MIN_BOUNDARY_POINTS) {
      return opFailure('validation', 'Trim requires a closed boundary stroke');
    }
    return opSuccess(undefined);
  },
  buildKernelRequest(session: OperationHandlerContext): OperationResult<KernelRequest> {
    const stroke = session.params.stroke;
    const targetObjectId = session.params.targetObjectId;
    if (typeof targetObjectId !== 'string') {
      return opFailure('validation', 'Missing targetObjectId');
    }
    if (!Array.isArray(stroke)) {
      return opFailure('validation', 'Missing boundary stroke');
    }
    return opSuccess({
      operation: 'trim',
      inputRevision: session.baseRevision,
      payload: Object.freeze({
        family: 'boolean',
        targetObjectId,
        boundary: stroke,
        boundaryPointCount: stroke.length,
        drawMode: session.params.drawMode ?? 'polyline'
      })
    });
  },
  validate(session: OperationHandlerContext, kernel: KernelSuccess | undefined) {
    if (kernel === undefined) {
      return opFailure('validation', 'Trim kernel result required');
    }
    if (kernel.fingerprint.length === 0) {
      return opFailure('validation', 'Trim kernel fingerprint missing');
    }
    const stroke = session.params.stroke;
    if (!Array.isArray(stroke) || stroke.length < MIN_BOUNDARY_POINTS) {
      return opFailure('validation', 'Invalid trim boundary');
    }
    return opSuccess(undefined);
  },
  buildCommandIntent(session: OperationHandlerContext, kernel: KernelSuccess | undefined) {
    if (kernel === undefined) {
      return opFailure('validation', 'Cannot build trim intent without kernel result');
    }
    const intent: CommandIntent = Object.freeze({
      name: 'trim.commit',
      operationId: session.id,
      operationKind: 'trim',
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
