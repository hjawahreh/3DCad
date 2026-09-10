export type ImportLifecyclePhase =
  | 'created'
  | 'validating'
  | 'selecting'
  | 'initializing'
  | 'importing'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'disposed';

const ALLOWED: Readonly<Record<ImportLifecyclePhase, readonly ImportLifecyclePhase[]>> = {
  created: ['validating', 'disposed'],
  validating: ['selecting', 'failed', 'cancelled', 'disposed'],
  selecting: ['initializing', 'failed', 'cancelled', 'disposed'],
  initializing: ['importing', 'failed', 'cancelled', 'disposed'],
  importing: ['finalizing', 'failed', 'cancelled', 'disposed'],
  finalizing: ['completed', 'failed', 'cancelled', 'disposed'],
  completed: ['disposed'],
  failed: ['disposed'],
  cancelled: ['disposed'],
  disposed: []
};

/**
 * Deterministic import session lifecycle.
 * Threading: single-owner per session; multiple sessions may run concurrently.
 */
export class ImportLifecycle {
  private phase: ImportLifecyclePhase = 'created';

  public getPhase(): ImportLifecyclePhase {
    return this.phase;
  }

  public canTransition(to: ImportLifecyclePhase): boolean {
    return ALLOWED[this.phase].includes(to);
  }

  public transition(to: ImportLifecyclePhase): boolean {
    if (!this.canTransition(to)) {
      return false;
    }
    this.phase = to;
    return true;
  }

  public force(to: ImportLifecyclePhase): void {
    this.phase = to;
  }

  public isTerminal(): boolean {
    return (
      this.phase === 'completed' ||
      this.phase === 'failed' ||
      this.phase === 'cancelled' ||
      this.phase === 'disposed'
    );
  }

  public isActive(): boolean {
    return (
      this.phase === 'validating' ||
      this.phase === 'selecting' ||
      this.phase === 'initializing' ||
      this.phase === 'importing' ||
      this.phase === 'finalizing'
    );
  }
}
