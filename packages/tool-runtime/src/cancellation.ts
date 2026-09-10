import { opFailure, opSuccess, type OperationId, type OperationResult } from './types.js';

/** Owns AbortControllers per operation; cancel is explicit and testable. */
export class CancellationManager {
  private readonly controllers = new Map<OperationId, AbortController>();

  public track(operationId: OperationId, controller: AbortController): void {
    this.controllers.set(operationId, controller);
  }

  public signal(operationId: OperationId): AbortSignal | undefined {
    return this.controllers.get(operationId)?.signal;
  }

  public isCancelled(operationId: OperationId): boolean {
    return this.controllers.get(operationId)?.signal.aborted === true;
  }

  public cancel(operationId: OperationId): OperationResult<void> {
    const controller = this.controllers.get(operationId);
    if (controller === undefined) {
      return opFailure('not-found', `No cancellation controller for ${operationId}`);
    }
    controller.abort();
    return opSuccess(undefined);
  }

  public release(operationId: OperationId): void {
    this.controllers.delete(operationId);
  }
}
