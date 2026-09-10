import type { CommitGate, CommitReceipt, CommandIntent } from './commit.js';
import type {
  DocumentRevision,
  OperationId,
  OperationKind,
  OperationResult,
  WorkflowStepId
} from './types.js';
import { opFailure } from './types.js';

export interface CommitCoordinatorRequest {
  readonly operationId: OperationId;
  readonly operationKind: OperationKind;
  readonly workflowStepId: WorkflowStepId | undefined;
  readonly baseRevision: DocumentRevision;
  readonly commandIntent: CommandIntent;
  readonly now: number;
  readonly validated: boolean;
  readonly kernelOk: boolean;
  readonly requiresKernel: boolean;
}

/**
 * Issues commit tokens only after validation + kernel success gates pass.
 * Wraps CommitGate; does not mutate the document.
 */
export class CommitCoordinator {
  public constructor(private readonly gate: CommitGate) {}

  public get gateRef(): CommitGate {
    return this.gate;
  }

  public commit(request: CommitCoordinatorRequest): OperationResult<CommitReceipt> {
    if (!request.validated) {
      return opFailure('forbidden', 'Commit denied: operation not validated');
    }
    if (request.requiresKernel && !request.kernelOk) {
      return opFailure('forbidden', 'Commit denied: missing kernel success');
    }
    return this.gate.issue({
      operationId: request.operationId,
      operationKind: request.operationKind,
      workflowStepId: request.workflowStepId,
      baseRevision: request.baseRevision,
      commandIntent: request.commandIntent,
      now: request.now
    });
  }
}
