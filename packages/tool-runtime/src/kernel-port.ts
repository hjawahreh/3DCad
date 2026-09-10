import type { Progress, ProgressReporter } from '@cad-studio/platform-runtime';
import { opFailure, opSuccess, type OperationResult } from './types.js';

/**
 * Opaque kernel port. Operation Runtime invokes geometry through this boundary only.
 * Implementations live in composition roots / kernel-bridge adapters — never in UI.
 */
export interface KernelRequest {
  readonly operation: string;
  readonly inputRevision: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface KernelSuccess {
  readonly fingerprint: string;
  readonly outputRevisionHint: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface KernelPort {
  execute(
    request: KernelRequest,
    signal: AbortSignal,
    report: ProgressReporter
  ): Promise<OperationResult<KernelSuccess>>;
}

/** Deterministic in-memory kernel for architecture and unit tests. */
export class MockKernelPort implements KernelPort {
  public calls: KernelRequest[] = [];
  public failNext: OperationResult<KernelSuccess> | undefined;
  public delayMs = 0;

  public async execute(
    request: KernelRequest,
    signal: AbortSignal,
    report: ProgressReporter
  ): Promise<OperationResult<KernelSuccess>> {
    this.calls.push(request);
    report({ completed: 0, total: 1, message: 'mock-kernel-start' } satisfies Progress);
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.delayMs);
      });
    }
    if (signal.aborted) {
      return opFailure('cancelled', 'Mock kernel cancelled');
    }
    if (this.failNext !== undefined) {
      const result = this.failNext;
      this.failNext = undefined;
      return result;
    }
    report({ completed: 1, total: 1, message: 'mock-kernel-done' });
    return opSuccess({
      fingerprint: `mock:${request.operation}:${String(request.inputRevision)}`,
      outputRevisionHint: request.inputRevision + 1,
      payload: { ...request.payload, ok: true }
    });
  }
}
