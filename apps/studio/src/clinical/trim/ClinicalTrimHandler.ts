/**
 * ClinicalTrimHandler — Operation Runtime handler for kind 'trim'.
 * PROD-001: reject accept when kernel reports no geometric change.
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

const metricNumber = (
  metrics: Readonly<Record<string, number>> | undefined,
  key: string
): number | undefined => {
  if (metrics === undefined) return undefined;
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const metaNumber = (diagnostics: unknown, key: string): number | undefined => {
  if (!Array.isArray(diagnostics)) return undefined;
  const prefix = `meta:${key}=`;
  for (const row of diagnostics) {
    if (typeof row !== 'string' || !row.startsWith(prefix)) continue;
    const n = Number(row.slice(prefix.length));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const metaString = (diagnostics: unknown, key: string): string | undefined => {
  if (!Array.isArray(diagnostics)) return undefined;
  const prefix = `meta:${key}=`;
  for (const row of diagnostics) {
    if (typeof row !== 'string' || !row.startsWith(prefix)) continue;
    const v = row.slice(prefix.length);
    if (v.length > 0) return v;
  }
  return undefined;
};

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
        drawMode: session.params.drawMode ?? 'polyline',
        // GEO-001E: preview must not commit working — Accept promotes the exact preview mesh.
        preview: session.params.preview === true,
        ...(session.params.viewport !== undefined ? { viewport: session.params.viewport } : {}),
        ...(session.params.loop3d !== undefined ? { loop3d: session.params.loop3d } : {}),
        ...(session.params.loopNormal !== undefined
          ? { loopNormal: session.params.loopNormal }
          : {}),
        ...(session.params.keepMode !== undefined ? { keepMode: session.params.keepMode } : {}),
        ...(session.params.algorithm !== undefined ? { algorithm: session.params.algorithm } : {})
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
    const metrics = kernel.payload.metrics as Readonly<Record<string, number>> | undefined;
    const removed =
      metricNumber(metrics, 'removedTriangles') ??
      metaNumber(kernel.payload.diagnostics, 'removedTriangles');
    const inputFaces =
      metricNumber(metrics, 'inputFaceCount') ??
      metaNumber(kernel.payload.diagnostics, 'inputFaceCount');
    const outputFaces =
      metricNumber(metrics, 'faceCount') ??
      metricNumber(metrics, 'triangleCount') ??
      (typeof kernel.payload.faceCount === 'number' ? kernel.payload.faceCount : undefined);
    const inputFp =
      typeof kernel.payload.inputFingerprint === 'string'
        ? kernel.payload.inputFingerprint
        : metaString(kernel.payload.diagnostics, 'inputFingerprint');
    if (
      inputFp !== undefined &&
      (kernel.fingerprint === inputFp ||
        kernel.fingerprint === `geo:${inputFp}` ||
        `geo:${kernel.fingerprint}` === inputFp)
    ) {
      return opFailure('validation', 'Trim produced no geometry change.');
    }
    if (
      (removed !== undefined && removed <= 0 && inputFaces !== undefined && outputFaces === inputFaces) ||
      (removed !== undefined && removed <= 0 && outputFaces === undefined) ||
      (removed === undefined && inputFaces !== undefined && outputFaces === inputFaces)
    ) {
      return opFailure('validation', 'Trim produced no geometry change.');
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
