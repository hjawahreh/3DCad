import type { ProgressReporter } from '@cad-studio/platform-runtime';
import type { CancellationManager } from './cancellation.js';
import type { KernelPort, KernelRequest, KernelSuccess } from './kernel-port.js';
import type { OperationDiagnostics } from './diagnostics.js';
import type { OperationMetrics } from './metrics.js';
import type { ProgressManager } from './progress.js';
import type { RetryPolicy } from './retry.js';
import type { ValidationPipeline } from './validation.js';
import { opFailure, type OperationId, type OperationResult } from './types.js';

export interface ExecuteKernelInput {
  readonly operationId: OperationId;
  readonly kind: string;
  readonly request: KernelRequest;
  readonly signal: AbortSignal;
  readonly report?: ProgressReporter;
  readonly now: () => number;
}

/**
 * Runs kernel calls with retry policy, progress, cancellation, metrics, and diagnostics.
 */
export class OperationExecutor {
  public constructor(
    private readonly kernel: KernelPort,
    private readonly retry: RetryPolicy,
    private readonly progress: ProgressManager,
    private readonly cancellation: CancellationManager,
    private readonly metrics: OperationMetrics,
    private readonly diagnostics: OperationDiagnostics,
    private readonly validation: ValidationPipeline
  ) {}

  public get validationPipeline(): ValidationPipeline {
    return this.validation;
  }

  public async execute(input: ExecuteKernelInput): Promise<OperationResult<KernelSuccess>> {
    let attempt = 0;
    let lastFailure: OperationResult<KernelSuccess> | undefined;

    while (attempt < this.retry.maxAttempts) {
      attempt += 1;
      if (attempt > 1) {
        this.metrics.recordRetry();
      }
      this.metrics.recordKernelAttempt();

      if (input.signal.aborted || this.cancellation.isCancelled(input.operationId)) {
        return opFailure('cancelled', `Operation ${input.operationId} cancelled`);
      }

      const report: ProgressReporter = (progress) => {
        this.progress.report(input.operationId, progress, input.now());
        input.report?.(progress);
      };

      const result = await this.kernel.execute(input.request, input.signal, report);
      if (result.ok) {
        this.diagnostics.record({
          level: 'info',
          operationId: input.operationId,
          kind: input.kind,
          code: 'kernel-success',
          message: `Kernel succeeded on attempt ${String(attempt)}`
        });
        return result;
      }

      lastFailure = result;
      this.diagnostics.record({
        level: 'warn',
        operationId: input.operationId,
        kind: input.kind,
        code: result.error.code,
        message: result.error.message
      });

      if (result.error.code === 'cancelled' || input.signal.aborted) {
        return result;
      }
      if (!this.retry.shouldRetry(attempt, result.error.code)) {
        return result;
      }
    }

    return lastFailure ?? opFailure('unexpected', 'Kernel execution produced no result');
  }
}
