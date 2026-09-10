/**
 * GeometryServicesKernelPort — Operation Runtime KernelPort → Geometry Services → Kernel Bridge.
 * Studio-owned adapter; platform packages unmodified.
 */

import type { ProgressReporter } from '@cad-studio/platform-runtime';
import type { GeometryServices, GeometryServiceFamily } from '@cad-studio/geometry-services';
import {
  opFailure,
  opSuccess,
  type KernelPort,
  type KernelRequest,
  type KernelSuccess,
  type OperationResult
} from '@cad-studio/tool-runtime';

const resolveFamily = (request: KernelRequest): GeometryServiceFamily => {
  const fromPayload = request.payload.family;
  if (typeof fromPayload === 'string') {
    return fromPayload as GeometryServiceFamily;
  }
  if (request.operation === 'trim') {
    return 'boolean';
  }
  if (request.operation === 'close-base') {
    return 'offset';
  }
  return 'boolean';
};

const resolveOperation = (request: KernelRequest, _family: GeometryServiceFamily): string => {
  const geometryOperation = request.payload.geometryOperation;
  if (typeof geometryOperation === 'string') {
    return geometryOperation;
  }
  if (request.operation === 'trim') {
    return 'subtract';
  }
  if (request.operation === 'close-base') {
    return 'uniform';
  }
  return request.operation;
};

const metricNumber = (
  metrics: Readonly<Record<string, number>> | undefined,
  key: string
): number | undefined => {
  if (metrics === undefined) return undefined;
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const metaFromDiagnostics = (
  diagnostics: readonly string[],
  key: string
): string | undefined => {
  const prefix = `meta:${key}=`;
  const hit = diagnostics.find((d) => d.startsWith(prefix));
  return hit === undefined ? undefined : hit.slice(prefix.length);
};

export class GeometryServicesKernelPort implements KernelPort {
  public constructor(private readonly geometry: GeometryServices) {}

  public async execute(
    request: KernelRequest,
    signal: AbortSignal,
    report: ProgressReporter
  ): Promise<OperationResult<KernelSuccess>> {
    const family = resolveFamily(request);
    const operation = resolveOperation(request, family);
    const result = await this.geometry.execute(
      {
        family,
        operation,
        inputRevision: request.inputRevision,
        payload: request.payload
      },
      signal,
      report
    );
    if (!result.ok) {
      const code =
        result.error.code === 'cancelled'
          ? 'cancelled'
          : result.error.code === 'validation'
            ? 'validation'
            : 'kernel';
      return opFailure(code, result.error.message);
    }
    const kernel = result.value.kernel;
    const vertexCount =
      metricNumber(kernel.metrics, 'vertexCount') ??
      (metaFromDiagnostics(kernel.diagnostics, 'vertexCount') !== undefined
        ? Number(metaFromDiagnostics(kernel.diagnostics, 'vertexCount'))
        : undefined);
    const faceCount =
      metricNumber(kernel.metrics, 'faceCount') ??
      metricNumber(kernel.metrics, 'triangleCount') ??
      (metaFromDiagnostics(kernel.diagnostics, 'faceCount') !== undefined
        ? Number(metaFromDiagnostics(kernel.diagnostics, 'faceCount'))
        : undefined);
    const backend = metaFromDiagnostics(kernel.diagnostics, 'backend') ?? 'clinical-reference-v1';
    const algorithm =
      metaFromDiagnostics(kernel.diagnostics, 'algorithm') ?? result.value.algorithm;

    return opSuccess({
      fingerprint: kernel.fingerprint,
      outputRevisionHint: kernel.revision,
      payload: Object.freeze({
        family: result.value.family,
        operation: result.value.operation,
        algorithm,
        backend,
        geometryHandles: kernel.geometryHandles,
        diagnostics: kernel.diagnostics,
        timingMs: kernel.timingMs,
        warnings: kernel.warnings,
        metrics: kernel.metrics,
        vertexCount,
        faceCount,
        geometryFingerprint: kernel.fingerprint,
        geometryRevision: kernel.revision,
        boundaryPoints: request.payload.boundary,
        targetObjectId: request.payload.targetObjectId
      })
    });
  }
}
