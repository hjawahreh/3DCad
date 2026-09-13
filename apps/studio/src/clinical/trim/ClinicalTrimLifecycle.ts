/**
 * ClinicalTrimLifecycle — trim tool session lifecycle.
 */

export type TrimSessionLifecycle =
  | 'none'
  | 'created'
  | 'active'
  | 'previewing'
  | 'committing'
  | 'completed'
  | 'cancelled'
  | 'disposed';

const ALLOWED: Readonly<Record<TrimSessionLifecycle, readonly TrimSessionLifecycle[]>> =
  Object.freeze({
    none: ['created'],
    created: ['active', 'cancelled', 'disposed'],
    active: ['previewing', 'committing', 'cancelled', 'disposed'],
    previewing: ['active', 'committing', 'cancelled', 'disposed'],
    committing: ['completed', 'cancelled', 'disposed', 'active'],
    completed: ['none', 'disposed', 'created', 'active'],
    cancelled: ['none', 'disposed'],
    disposed: []
  });

export class ClinicalTrimLifecycle {
  private phase: TrimSessionLifecycle = 'none';

  public getPhase(): TrimSessionLifecycle {
    return this.phase;
  }

  public canTransition(next: TrimSessionLifecycle): boolean {
    return ALLOWED[this.phase].includes(next);
  }

  public transition(next: TrimSessionLifecycle): boolean {
    if (!this.canTransition(next)) {
      return false;
    }
    this.phase = next;
    return true;
  }

  public reset(): void {
    this.phase = 'none';
  }
}
