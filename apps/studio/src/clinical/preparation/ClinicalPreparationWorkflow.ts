/**
 * ClinicalPreparationWorkflow — phase machine for preparation orchestration.
 */

export type PreparationWorkflowPhase =
  | 'idle'
  | 'case-ready'
  | 'orientation-validation'
  | 'preparation-ready'
  | 'tool-selection'
  | 'preparation-session'
  | 'tool-activation'
  | 'validation'
  | 'complete'
  | 'ready-for-geometry'
  | 'cancelled';

export const PREPARATION_WORKFLOW_ORDER: readonly PreparationWorkflowPhase[] = Object.freeze([
  'idle',
  'case-ready',
  'orientation-validation',
  'preparation-ready',
  'tool-selection',
  'preparation-session',
  'tool-activation',
  'validation',
  'complete',
  'ready-for-geometry'
]);

const ALLOWED: Readonly<Record<PreparationWorkflowPhase, readonly PreparationWorkflowPhase[]>> =
  Object.freeze({
    idle: ['case-ready', 'cancelled'],
    'case-ready': ['orientation-validation', 'cancelled', 'idle'],
    'orientation-validation': ['preparation-ready', 'cancelled', 'idle'],
    // Auto-prep may skip tool selection and go straight into session / validation.
    'preparation-ready': [
      'tool-selection',
      'preparation-session',
      'validation',
      'cancelled',
      'idle'
    ],
    'tool-selection': ['preparation-session', 'tool-selection', 'cancelled', 'idle'],
    'preparation-session': ['tool-activation', 'validation', 'cancelled', 'idle'],
    'tool-activation': ['validation', 'tool-selection', 'cancelled', 'idle'],
    validation: ['complete', 'tool-activation', 'cancelled', 'idle'],
    complete: ['ready-for-geometry', 'idle'],
    'ready-for-geometry': ['idle', 'case-ready'],
    cancelled: ['idle', 'case-ready']
  });

export class ClinicalPreparationWorkflow {
  private phase: PreparationWorkflowPhase = 'idle';

  public getPhase(): PreparationWorkflowPhase {
    return this.phase;
  }

  public canTransition(next: PreparationWorkflowPhase): boolean {
    return ALLOWED[this.phase].includes(next);
  }

  public transition(next: PreparationWorkflowPhase): boolean {
    if (!this.canTransition(next)) {
      return false;
    }
    this.phase = next;
    return true;
  }

  /** Sync workflow phase after recovery / complete when machine hops are blocked. */
  public forcePhase(next: PreparationWorkflowPhase): void {
    this.phase = next;
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

  public order(): readonly PreparationWorkflowPhase[] {
    return PREPARATION_WORKFLOW_ORDER;
  }

  public isInProgress(): boolean {
    return (
      this.phase !== 'idle' &&
      this.phase !== 'complete' &&
      this.phase !== 'ready-for-geometry' &&
      this.phase !== 'cancelled'
    );
  }
}
