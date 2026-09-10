/**
 * ClinicalPreparationLifecycle — preparation session lifecycle states.
 */

export type PreparationSessionLifecycle =
  | 'none'
  | 'created'
  | 'active'
  | 'suspended'
  | 'cancelled'
  | 'completed'
  | 'disposed';

const ALLOWED: Readonly<Record<PreparationSessionLifecycle, readonly PreparationSessionLifecycle[]>> =
  Object.freeze({
    none: ['created'],
    created: ['active', 'cancelled', 'disposed'],
    active: ['suspended', 'completed', 'cancelled', 'disposed'],
    suspended: ['active', 'cancelled', 'disposed'],
    cancelled: ['none', 'created', 'disposed'],
    completed: ['none', 'created', 'disposed'],
    disposed: []
  });

export class ClinicalPreparationLifecycle {
  private phase: PreparationSessionLifecycle = 'none';

  public getPhase(): PreparationSessionLifecycle {
    return this.phase;
  }

  public canTransition(next: PreparationSessionLifecycle): boolean {
    return ALLOWED[this.phase].includes(next);
  }

  public transition(next: PreparationSessionLifecycle): boolean {
    if (!this.canTransition(next)) {
      return false;
    }
    this.phase = next;
    return true;
  }

  public reset(): void {
    this.phase = 'none';
  }

  public isActive(): boolean {
    return this.phase === 'active' || this.phase === 'suspended';
  }

  public hasSession(): boolean {
    return (
      this.phase === 'created' ||
      this.phase === 'active' ||
      this.phase === 'suspended' ||
      this.phase === 'completed' ||
      this.phase === 'cancelled'
    );
  }
}
