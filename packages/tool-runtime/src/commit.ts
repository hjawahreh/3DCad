import {
  asCommitTokenId,
  opFailure,
  opSuccess,
  type CommitTokenId,
  type DocumentRevision,
  type OperationId,
  type OperationKind,
  type OperationResult,
  type WorkflowStepId
} from './types.js';

/**
 * Intent handed to Application after a successful operation commit.
 * Application turns this into a Domain command. Operation Runtime never mutates the document.
 */
export interface CommandIntent {
  readonly name: string;
  readonly operationId: OperationId;
  readonly operationKind: OperationKind;
  readonly baseRevision: DocumentRevision;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly kernelFingerprint?: string;
  readonly undoable: boolean;
}

export interface CommitToken {
  readonly id: CommitTokenId;
  readonly operationId: OperationId;
  readonly operationKind: OperationKind;
  readonly workflowStepId: WorkflowStepId | undefined;
  readonly baseRevision: DocumentRevision;
  readonly commandIntent: CommandIntent;
  readonly issuedAt: number;
  readonly consumed: boolean;
}

export interface CommitReceipt {
  readonly token: CommitToken;
  readonly commandIntent: CommandIntent;
}

let commitSerial = 1;

export class CommitGate {
  private readonly tokens = new Map<CommitTokenId, CommitToken>();

  public issue(input: {
    readonly operationId: OperationId;
    readonly operationKind: OperationKind;
    readonly workflowStepId: WorkflowStepId | undefined;
    readonly baseRevision: DocumentRevision;
    readonly commandIntent: CommandIntent;
    readonly now: number;
  }): OperationResult<CommitReceipt> {
    const id = asCommitTokenId(`commit-${String(commitSerial)}`);
    commitSerial += 1;
    const token: CommitToken = {
      id,
      operationId: input.operationId,
      operationKind: input.operationKind,
      workflowStepId: input.workflowStepId,
      baseRevision: input.baseRevision,
      commandIntent: input.commandIntent,
      issuedAt: input.now,
      consumed: false
    };
    this.tokens.set(id, token);
    return opSuccess({ token, commandIntent: input.commandIntent });
  }

  public peek(id: CommitTokenId): OperationResult<CommitToken> {
    const token = this.tokens.get(id);
    if (token === undefined) {
      return opFailure('not-found', `Unknown commit token ${id}`);
    }
    return opSuccess(token);
  }

  /**
   * Application consumes the token when the Domain command is accepted.
   * A token may be consumed once. Workflow gates require an unconsumed or
   * successfully consumed token depending on policy — see WorkflowGate.
   */
  public consume(id: CommitTokenId): OperationResult<CommitToken> {
    const token = this.tokens.get(id);
    if (token === undefined) {
      return opFailure('not-found', `Unknown commit token ${id}`);
    }
    if (token.consumed) {
      return opFailure('conflict', `Commit token ${id} already consumed`);
    }
    const consumed: CommitToken = { ...token, consumed: true };
    this.tokens.set(id, consumed);
    return opSuccess(consumed);
  }

  public revoke(id: CommitTokenId): OperationResult<void> {
    if (!this.tokens.delete(id)) {
      return opFailure('not-found', `Unknown commit token ${id}`);
    }
    return opSuccess(undefined);
  }

  public clear(): void {
    this.tokens.clear();
  }
}
