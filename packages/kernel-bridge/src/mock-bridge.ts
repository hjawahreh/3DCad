import type { ProgressReporter } from '@cad-studio/platform-runtime';
import { CapabilityNegotiator } from './capabilities.js';
import type { KernelBridge, KernelInvokeRequest } from './session.js';
import {
  asOpaqueGeometryHandle,
  kernelFailure,
  kernelSuccess,
  type KernelOperationResult,
  type KernelResult
} from './types.js';

/**
 * Contract-faithful mock kernel. No production geometry algorithms.
 */
export class MockKernelBridge implements KernelBridge {
  public readonly capabilities: CapabilityNegotiator;
  public calls: KernelInvokeRequest[] = [];
  public failNext: KernelResult<KernelOperationResult> | undefined;

  public constructor(capabilities: CapabilityNegotiator = CapabilityNegotiator.mockFull()) {
    this.capabilities = capabilities;
  }

  public async invoke(
    request: KernelInvokeRequest,
    signal: AbortSignal,
    report: ProgressReporter
  ): Promise<KernelResult<KernelOperationResult>> {
    this.calls.push(request);
    const started = performance.now();
    report({ completed: 0, total: 1, message: `mock:${request.operation}` });

    const required = this.capabilities.require(request.capability);
    if (!required.ok) {
      return required;
    }
    if (signal.aborted) {
      return kernelFailure('cancelled', 'Mock kernel cancelled');
    }
    if (this.failNext !== undefined) {
      const next = this.failNext;
      this.failNext = undefined;
      return next;
    }

    report({ completed: 1, total: 1 });
    const timingMs = performance.now() - started;
    return kernelSuccess({
      revision: request.inputRevision + 1,
      fingerprint: `mock:${request.capability}:${request.operation}:${String(request.inputRevision)}`,
      diagnostics: [`mock-ok:${request.operation}`],
      timingMs,
      warnings: [],
      geometryHandles: [asOpaqueGeometryHandle(this.calls.length)],
      metrics: { invokeCount: this.calls.length },
      validation: { ok: true, codes: [] }
    });
  }
}
