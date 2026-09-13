/**
 * ClinicalCloseBaseWorkflow — phase machine (cancellable before commit).
 */

export type CloseBaseWorkflowPhase =
  | 'idle'
  | 'activating'
  | 'validating-case'
  | 'selecting-strategy'
  | 'configuring'
  | 'previewing'
  | 'validating'
  | 'submitting'
  | 'executing'
  | 'committing'
  | 'completed'
  | 'cancelled'
  | 'failed';

const ALLOWED: Readonly<Record<CloseBaseWorkflowPhase, readonly CloseBaseWorkflowPhase[]>> =
  Object.freeze({
    idle: ['activating', 'cancelled'],
    activating: ['validating-case', 'cancelled', 'idle', 'failed'],
    'validating-case': ['selecting-strategy', 'cancelled', 'idle', 'failed'],
    'selecting-strategy': ['configuring', 'previewing', 'cancelled', 'idle'],
    configuring: ['previewing', 'selecting-strategy', 'configuring', 'cancelled', 'idle'],
    previewing: ['configuring', 'validating', 'previewing', 'cancelled', 'idle'],
    validating: ['submitting', 'previewing', 'configuring', 'cancelled', 'idle', 'failed'],
    submitting: ['executing', 'cancelled', 'idle', 'failed'],
    executing: ['committing', 'cancelled', 'idle', 'failed', 'previewing'],
    committing: ['completed', 'cancelled', 'idle', 'failed', 'previewing'],
    completed: ['idle', 'activating', 'previewing'],
    cancelled: ['idle'],
    failed: ['idle', 'configuring', 'previewing']
  });

export class ClinicalCloseBaseWorkflow {
  private phase: CloseBaseWorkflowPhase = 'idle';

  public getPhase(): CloseBaseWorkflowPhase {
    return this.phase;
  }

  public canTransition(next: CloseBaseWorkflowPhase): boolean {
    return ALLOWED[this.phase].includes(next);
  }

  public transition(next: CloseBaseWorkflowPhase): boolean {
    if (!this.canTransition(next)) {
      return false;
    }
    this.phase = next;
    return true;
  }

  public cancel(): boolean {
    if (this.phase === 'idle' || this.phase === 'completed') {
      return true;
    }
    if (this.canTransition('cancelled')) {
      this.phase = 'cancelled';
      return true;
    }
    return false;
  }

  public reset(): void {
    this.phase = 'idle';
  }

  public isActive(): boolean {
    return (
      this.phase !== 'idle' &&
      this.phase !== 'completed' &&
      this.phase !== 'cancelled' &&
      this.phase !== 'failed'
    );
  }
}
