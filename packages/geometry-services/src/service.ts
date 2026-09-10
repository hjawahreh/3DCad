import type { ProgressReporter } from '@cad-studio/platform-runtime';
import {
  createKernelPortSet,
  type KernelFamilyPort,
  type KernelOperationResult,
  type ManagedKernelSession
} from '@cad-studio/kernel-bridge';
import { geoFailure, geoSuccess, type GeometryResult, type GeometryServiceFamily } from './types.js';

export interface GeometryServiceRequest {
  readonly family: GeometryServiceFamily;
  readonly operation: string;
  readonly inputRevision: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly algorithm?: string;
}

export interface GeometryServiceResult {
  readonly family: GeometryServiceFamily;
  readonly operation: string;
  readonly algorithm: string;
  readonly kernel: KernelOperationResult;
  readonly validated: true;
}

export interface GeometryService {
  readonly family: GeometryServiceFamily;
  readonly supportedOperations: readonly string[];
  execute(
    session: ManagedKernelSession,
    request: GeometryServiceRequest,
    signal: AbortSignal,
    report: ProgressReporter
  ): Promise<GeometryResult<GeometryServiceResult>>;
}

const defaultOps: Record<GeometryServiceFamily, readonly string[]> = {
  boolean: ['union', 'subtract', 'intersect'],
  transform: ['translate', 'rotate', 'scale'],
  repair: ['heal', 'fill-holes'],
  remesh: ['isotropic', 'adaptive'],
  offset: ['uniform', 'variable'],
  collision: ['contacts', 'penetration'],
  measurement: ['distance', 'volume', 'area'],
  validation: ['manifold', 'watertight', 'normals'],
  topology: ['components', 'boundaries']
};

/**
 * Adapter: Geometry Service → abstract KernelFamilyPort → Bridge → Kernel.
 * The service never knows mock vs native vs WASM.
 */
export const createPortAdapter = (
  family: GeometryServiceFamily,
  port: KernelFamilyPort
): GeometryService => ({
  family,
  supportedOperations: defaultOps[family],
  async execute(session, request, signal, report) {
    if (request.family !== family) {
      return geoFailure('invalid', `Service ${family} cannot run family ${request.family}`);
    }
    if (!defaultOps[family].includes(request.operation)) {
      return geoFailure(
        'unsupported',
        `Operation ${request.operation} not supported by ${family}`
      );
    }
    if (port.capability !== family) {
      return geoFailure('invalid', `Port capability ${port.capability} !== ${family}`);
    }
    const algorithm = request.algorithm ?? `${family}.default`;
    const kernel = await port.execute(
      session,
      request.operation,
      request.inputRevision,
      { ...request.payload, algorithm },
      signal,
      report
    );
    if (!kernel.ok) {
      const code =
        kernel.error.code === 'unsupported'
          ? 'unsupported'
          : kernel.error.code === 'cancelled'
            ? 'cancelled'
            : 'kernel';
      return geoFailure(code, kernel.error.message, kernel.error);
    }
    if (!kernel.value.validation.ok) {
      return geoFailure('validation', 'Kernel validation failed', kernel.value.validation.codes);
    }
    if (kernel.value.fingerprint.trim().length === 0) {
      return geoFailure('validation', 'Kernel result missing fingerprint');
    }
    return geoSuccess({
      family,
      operation: request.operation,
      algorithm,
      kernel: kernel.value,
      validated: true as const
    });
  }
});

export const createStubService = (family: GeometryServiceFamily): GeometryService => {
  const ports = createKernelPortSet();
  return createPortAdapter(family, ports[family]);
};
