/**
 * ClinicalTrimWorkflow — phase machine (every stage cancellable).
 */

export type TrimWorkflowPhase =
  | 'idle'
  | 'activating'
  | 'acquiring-pointer'
  | 'drawing'
  | 'preview-boundary'
  | 'validating'
  | 'submitting'
  | 'executing'
  | 'committing'
  | 'completed'
  | 'cancelled';

const ALLOWED: Readonly<Record<TrimWorkflowPhase, readonly TrimWorkflowPhase[]>> = Object.freeze({
  idle: ['activating', 'cancelled'],
  activating: ['acquiring-pointer', 'cancelled', 'idle'],
  'acquiring-pointer': ['drawing', 'cancelled', 'idle'],
  drawing: ['drawing', 'preview-boundary', 'validating', 'cancelled', 'idle'],
  'preview-boundary': ['drawing', 'validating', 'cancelled', 'idle'],
  validating: ['submitting', 'drawing', 'cancelled', 'idle'],
  submitting: ['executing', 'cancelled', 'idle'],
  executing: ['committing', 'cancelled', 'idle'],
  committing: ['completed', 'cancelled', 'idle'],
  completed: ['idle'],
  cancelled: ['idle']
});

export class ClinicalTrimWorkflow {
  private phase: TrimWorkflowPhase = 'idle';

  public getPhase(): TrimWorkflowPhase {
    return this.phase;
  }

  public canTransition(next: TrimWorkflowPhase): boolean {
    return ALLOWED[this.phase].includes(next);
  }

  public transition(next: TrimWorkflowPhase): boolean {
    if (!this.canTransition(next)) {
      return false;
    }
    this.phase = next;
    return true;
  }

  public cancel(): boolean {
    if (this.phase === 'idle') {
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
      this.phase !== 'cancelled'
    );
  }
}
