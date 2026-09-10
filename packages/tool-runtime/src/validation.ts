import type { KernelSuccess } from './kernel-port.js';
import type { OperationHandler, OperationHandlerContext } from './operation.js';
import { opFailure, opSuccess, type OperationResult } from './types.js';

export type ValidationStage = 'precondition' | 'geometry' | 'result';

export interface ValidationStep {
  readonly stage: ValidationStage;
  readonly name: string;
  run(context: OperationHandlerContext, kernel: KernelSuccess | undefined): OperationResult<void>;
}

/**
 * Ordered validation pipeline: preconditions → geometry hooks → result hooks → handler.validate.
 */
export class ValidationPipeline {
  private readonly steps: ValidationStep[] = [];

  public add(step: ValidationStep): void {
    this.steps.push(step);
  }

  public clear(): void {
    this.steps.length = 0;
  }

  public list(): readonly ValidationStep[] {
    return this.steps;
  }

  public runPreconditions(context: OperationHandlerContext): OperationResult<void> {
    return this.runStage('precondition', context, undefined);
  }

  public runGeometry(
    context: OperationHandlerContext,
    kernel: KernelSuccess
  ): OperationResult<void> {
    return this.runStage('geometry', context, kernel);
  }

  public runResult(
    context: OperationHandlerContext,
    kernel: KernelSuccess | undefined
  ): OperationResult<void> {
    return this.runStage('result', context, kernel);
  }

  public runFull(
    context: OperationHandlerContext,
    kernel: KernelSuccess | undefined,
    handler: OperationHandler | undefined,
    requiresKernel: boolean
  ): OperationResult<void> {
    if (requiresKernel && kernel === undefined) {
      return opFailure('validation', 'Kernel result required before validation');
    }
    const geometry =
      kernel === undefined ? opSuccess(undefined) : this.runGeometry(context, kernel);
    if (!geometry.ok) {
      return geometry;
    }
    const result = this.runResult(context, kernel);
    if (!result.ok) {
      return result;
    }
    if (handler?.validate !== undefined) {
      return handler.validate(context, kernel);
    }
    return opSuccess(undefined);
  }

  private runStage(
    stage: ValidationStage,
    context: OperationHandlerContext,
    kernel: KernelSuccess | undefined
  ): OperationResult<void> {
    for (const step of this.steps) {
      if (step.stage !== stage) {
        continue;
      }
      const outcome = step.run(context, kernel);
      if (!outcome.ok) {
        return outcome;
      }
    }
    return opSuccess(undefined);
  }
}

/** Default result validator: fingerprint present when kernel ran. */
export class ResultValidator {
  public validate(kernel: KernelSuccess | undefined, requiresKernel: boolean): OperationResult<void> {
    if (requiresKernel) {
      if (kernel === undefined) {
        return opFailure('validation', 'Missing kernel success');
      }
      if (kernel.fingerprint.trim().length === 0) {
        return opFailure('validation', 'Kernel fingerprint is required');
      }
    }
    return opSuccess(undefined);
  }
}
