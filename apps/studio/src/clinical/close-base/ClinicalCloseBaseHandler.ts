/**
 * ClinicalCloseBaseHandler — Operation Runtime handler for kind 'close-base'.
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
import { CLOSE_BASE_PARAMETER_LIMITS } from './ClinicalCloseBaseParameters.js';
import {
  getCloseBaseStrategy,
  planeNormalForOrientation,
  type CloseBaseOrientation,
  type CloseBaseStrategyId
} from './ClinicalCloseBaseStrategy.js';

const asStrategy = (value: unknown): CloseBaseStrategyId | undefined =>
  value === 'plane' || value === 'surface' || value === 'offset' ? value : undefined;

const asOrientation = (value: unknown): CloseBaseOrientation =>
  value === 'xz' || value === 'yz' ? value : 'xy';

export const createClinicalCloseBaseOperationHandler = (): OperationHandler => ({
  kind: 'close-base',
  onStart(_session, params) {
    const strategy = asStrategy(params.strategy);
    if (strategy === undefined || getCloseBaseStrategy(strategy) === undefined) {
      return opFailure('validation', 'Close Base requires a supported strategy');
    }
    if (typeof params.targetObjectId !== 'string') {
      return opFailure('validation', 'Close Base requires a target object');
    }
    return opSuccess(undefined);
  },
  buildKernelRequest(session: OperationHandlerContext): OperationResult<KernelRequest> {
    const strategyId = asStrategy(session.params.strategy);
    const strategy = strategyId === undefined ? undefined : getCloseBaseStrategy(strategyId);
    if (strategy === undefined) {
      return opFailure('validation', 'Unsupported Close Base strategy');
    }
    const targetObjectId = session.params.targetObjectId;
    if (typeof targetObjectId !== 'string') {
      return opFailure('validation', 'Missing targetObjectId');
    }
    const height = typeof session.params.height === 'number' ? session.params.height : 2;
    const thickness =
      typeof session.params.thickness === 'number' ? session.params.thickness : 1.5;
    const margin = typeof session.params.margin === 'number' ? session.params.margin : 0.2;
    const limits = CLOSE_BASE_PARAMETER_LIMITS;
    if (height < limits.heightMin || thickness < limits.thicknessMin) {
      return opFailure('validation', 'Invalid Close Base dimensions');
    }
    const orientation = asOrientation(session.params.orientation);
    return opSuccess({
      operation: 'close-base',
      inputRevision: session.baseRevision,
      payload: Object.freeze({
        family: strategy.family,
        geometryOperation: strategy.geometryOperation,
        targetObjectId,
        strategy: strategy.id,
        height,
        thickness,
        margin,
        smoothing: session.params.smoothing === true,
        orientation,
        planeNormal: planeNormalForOrientation(orientation),
        preferRequestedOrientation: true,
        preview: session.params.preview === true
      })
    });
  },
  validate(session: OperationHandlerContext, kernel: KernelSuccess | undefined) {
    if (kernel === undefined) {
      return opFailure('validation', 'Close Base kernel result required');
    }
    if (kernel.fingerprint.length === 0) {
      return opFailure('validation', 'Close Base kernel fingerprint missing');
    }
    if (typeof session.params.targetObjectId !== 'string') {
      return opFailure('validation', 'Invalid Close Base target');
    }
    const metrics = kernel.payload.metrics as Readonly<Record<string, number>> | undefined;
    const added =
      typeof metrics?.addedTriangles === 'number' ? metrics.addedTriangles : undefined;
    if (added !== undefined && added <= 0) {
      return opFailure('validation', 'Close Base produced no geometry change.');
    }
    // GEO-001D preview quality gate — reject slab / bridge / match failures.
    const warningList = [
      ...(Array.isArray(kernel.payload.warnings)
        ? (kernel.payload.warnings as readonly unknown[]).map(String)
        : []),
      ...(Array.isArray(kernel.payload.diagnostics)
        ? (kernel.payload.diagnostics as readonly unknown[]).map(String)
        : [])
    ];
    const blocked = warningList.find(
      (w) =>
        w.includes('baseV2:slab=true') ||
        w.includes('baseV2:boundaryMatch=false') ||
        w.includes('baseV2:bridgeRejected=true') ||
        w.includes('meta:baseSlab=true') ||
        w.includes('meta:baseBoundaryMatch=false')
    );
    if (blocked !== undefined) {
      return opFailure(
        'validation',
        `Close Base preview quality gate failed (${blocked}). Preview unavailable.`
      );
    }
    return opSuccess(undefined);
  },
  buildCommandIntent(session: OperationHandlerContext, kernel: KernelSuccess | undefined) {
    if (kernel === undefined) {
      return opFailure('validation', 'Cannot build close-base intent without kernel result');
    }
    const intent: CommandIntent = Object.freeze({
      name: 'close-base.commit',
      operationId: session.id,
      operationKind: 'close-base',
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
