import type { Progress } from '@cad-studio/platform-runtime';
import type { OperationId } from './types.js';

export interface ProgressSnapshot {
  readonly operationId: OperationId;
  readonly completed: number;
  readonly total: number;
  readonly message: string | undefined;
  readonly updatedAt: number;
}

/** Tracks per-operation progress independently of session phase. */
export class ProgressManager {
  private readonly byOp = new Map<OperationId, ProgressSnapshot>();

  public report(
    operationId: OperationId,
    progress: Progress,
    now: number
  ): ProgressSnapshot {
    const snapshot: ProgressSnapshot = {
      operationId,
      completed: progress.completed,
      total: progress.total ?? 1,
      message: progress.message ?? undefined,
      updatedAt: now
    };
    this.byOp.set(operationId, snapshot);
    return snapshot;
  }

  public get(operationId: OperationId): ProgressSnapshot | undefined {
    return this.byOp.get(operationId);
  }

  public clear(operationId: OperationId): void {
    this.byOp.delete(operationId);
  }
}
