/**
 * ClinicalCloseBaseLifecycle — close-base session lifecycle.
 */

export type CloseBaseSessionLifecycle =
  | 'none'
  | 'created'
  | 'active'
  | 'previewing'
  | 'processing'
  | 'committing'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'disposed';

const ALLOWED: Readonly<Record<CloseBaseSessionLifecycle, readonly CloseBaseSessionLifecycle[]>> =
  Object.freeze({
    none: ['created'],
    created: ['active', 'cancelled', 'disposed', 'failed'],
    active: ['previewing', 'processing', 'cancelled', 'disposed', 'failed'],
    previewing: ['active', 'processing', 'committing', 'cancelled', 'disposed', 'failed'],
    processing: ['committing', 'previewing', 'cancelled', 'disposed', 'failed'],
    committing: ['completed', 'cancelled', 'disposed', 'failed'],
    completed: ['none', 'disposed'],
    cancelled: ['none', 'disposed'],
    failed: ['none', 'previewing', 'disposed'],
    disposed: []
  });

export class ClinicalCloseBaseLifecycle {
  private phase: CloseBaseSessionLifecycle = 'none';

  public getPhase(): CloseBaseSessionLifecycle {
    return this.phase;
  }

  public canTransition(next: CloseBaseSessionLifecycle): boolean {
    return ALLOWED[this.phase].includes(next);
  }

  public transition(next: CloseBaseSessionLifecycle): boolean {
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
