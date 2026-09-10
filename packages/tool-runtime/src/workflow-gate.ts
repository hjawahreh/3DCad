import {
  opFailure,
  opSuccess,
  type CommitTokenId,
  type OperationResult,
  type WorkflowStepId
} from './types.js';
import type { CommitGate } from './commit.js';

/**
 * Prevents workflow advance unless a matching successful operation commit exists.
 * This is the production invariant that Trim/Close Base violated when missing.
 */
export class WorkflowGate {
  public constructor(private readonly commits: CommitGate) {}

  public canAdvance(
    stepId: WorkflowStepId,
    tokenId: CommitTokenId | undefined
  ): OperationResult<{ readonly allowed: true; readonly tokenId: CommitTokenId }> {
    if (tokenId === undefined) {
      return opFailure(
        'forbidden',
        `Workflow step ${stepId} cannot advance without an operation commit token`
      );
    }
    const peeked = this.commits.peek(tokenId);
    if (!peeked.ok) {
      return peeked;
    }
    const token = peeked.value;
    if (token.workflowStepId !== undefined && token.workflowStepId !== stepId) {
      return opFailure(
        'forbidden',
        `Commit token ${tokenId} is not valid for workflow step ${stepId}`
      );
    }
    if (token.consumed) {
      return opFailure('conflict', `Commit token ${tokenId} was already consumed`);
    }
    return opSuccess({ allowed: true as const, tokenId });
  }

  /**
   * Advances a step only after verifying and consuming the commit token.
   * Application should call this before marking the clinical workflow step complete.
   */
  public advance(
    stepId: WorkflowStepId,
    tokenId: CommitTokenId | undefined
  ): OperationResult<{ readonly stepId: WorkflowStepId; readonly tokenId: CommitTokenId }> {
    const allowed = this.canAdvance(stepId, tokenId);
    if (!allowed.ok) {
      return allowed;
    }
    const consumed = this.commits.consume(allowed.value.tokenId);
    if (!consumed.ok) {
      return consumed;
    }
    return opSuccess({ stepId, tokenId: allowed.value.tokenId });
  }
}
