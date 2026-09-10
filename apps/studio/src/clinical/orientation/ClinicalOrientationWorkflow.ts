/**
 * ClinicalOrientationWorkflow — phase machine with cancel at every stage.
 */

import type { OrientationPhase } from './ClinicalOrientationState.js';

const ORDER: readonly OrientationPhase[] = Object.freeze([
  'idle',
  'entering',
  'active',
  'previewing',
  'committing',
  'completed'
]);

const ALLOWED: Readonly<Record<OrientationPhase, readonly OrientationPhase[]>> = {
  idle: ['entering', 'cancelled'],
  entering: ['active', 'cancelled', 'idle'],
  active: ['previewing', 'active', 'cancelled', 'idle'],
  previewing: ['previewing', 'committing', 'active', 'cancelled', 'idle'],
  committing: ['completed', 'cancelled', 'idle'],
  completed: ['idle', 'entering'],
  cancelled: ['idle', 'entering']
};

export class ClinicalOrientationWorkflow {
  private phase: OrientationPhase = 'idle';

  public getPhase(): OrientationPhase {
    return this.phase;
  }

  public canTransition(next: OrientationPhase): boolean {
    return ALLOWED[this.phase].includes(next);
  }

  public transition(next: OrientationPhase): boolean {
    if (!this.canTransition(next)) {
      return false;
    }
    this.phase = next;
    return true;
  }

  public cancel(): boolean {
    if (this.phase === 'idle' || this.phase === 'completed') {
      this.phase = 'idle';
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

  public order(): readonly OrientationPhase[] {
    return ORDER;
  }
}
