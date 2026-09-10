import type { ProgressReporter } from '@cad-studio/platform-runtime';
import type { ManagedKernelSession } from './session.js';
import type { KernelCapability, KernelOperationResult, KernelResult } from './types.js';

/**
 * Abstract per-family port. Geometry Services adapters call these;
 * they never know mock vs native vs WASM.
 */
export interface KernelFamilyPort {
  readonly capability: KernelCapability;
  execute(
    session: ManagedKernelSession,
    operation: string,
    inputRevision: number,
    payload: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
    report: ProgressReporter
  ): Promise<KernelResult<KernelOperationResult>>;
}

const createFamilyPort = (capability: KernelCapability): KernelFamilyPort => ({
  capability,
  async execute(session, operation, inputRevision, payload, signal, report) {
    return session.invoke(
      { capability, operation, inputRevision, payload },
      signal,
      report
    );
  }
});

export const createBooleanPort = (): KernelFamilyPort => createFamilyPort('boolean');
export const createTransformPort = (): KernelFamilyPort => createFamilyPort('transform');
export const createRepairPort = (): KernelFamilyPort => createFamilyPort('repair');
export const createRemeshPort = (): KernelFamilyPort => createFamilyPort('remesh');
export const createOffsetPort = (): KernelFamilyPort => createFamilyPort('offset');
export const createCollisionPort = (): KernelFamilyPort => createFamilyPort('collision');
export const createMeasurementPort = (): KernelFamilyPort => createFamilyPort('measurement');
export const createValidationPort = (): KernelFamilyPort => createFamilyPort('validation');
export const createTopologyPort = (): KernelFamilyPort => createFamilyPort('topology');

export interface KernelPortSet {
  readonly boolean: KernelFamilyPort;
  readonly transform: KernelFamilyPort;
  readonly repair: KernelFamilyPort;
  readonly remesh: KernelFamilyPort;
  readonly offset: KernelFamilyPort;
  readonly collision: KernelFamilyPort;
  readonly measurement: KernelFamilyPort;
  readonly validation: KernelFamilyPort;
  readonly topology: KernelFamilyPort;
}

export const createKernelPortSet = (): KernelPortSet => ({
  boolean: createBooleanPort(),
  transform: createTransformPort(),
  repair: createRepairPort(),
  remesh: createRemeshPort(),
  offset: createOffsetPort(),
  collision: createCollisionPort(),
  measurement: createMeasurementPort(),
  validation: createValidationPort(),
  topology: createTopologyPort()
});
