export type SelectionLifecyclePhase =
  | 'created'
  | 'beginning'
  | 'ready'
  | 'modifying'
  | 'committing'
  | 'committed'
  | 'clearing'
  | 'disposed';

const ALLOWED: Readonly<
  Record<SelectionLifecyclePhase, readonly SelectionLifecyclePhase[]>
> = {
  created: ['beginning', 'disposed'],
  beginning: ['ready', 'disposed'],
  ready: ['modifying', 'clearing', 'disposed'],
  modifying: ['committing', 'ready', 'disposed'],
  committing: ['committed', 'disposed'],
  committed: ['ready', 'modifying', 'clearing', 'disposed'],
  clearing: ['ready', 'disposed'],
  disposed: []
};

/**
 * Deterministic selection session lifecycle.
 * Threading: single-owner.
 */
export class SelectionLifecycle {
  private phase: SelectionLifecyclePhase = 'created';

  public getPhase(): SelectionLifecyclePhase {
    return this.phase;
  }

  public canTransition(to: SelectionLifecyclePhase): boolean {
    return ALLOWED[this.phase].includes(to);
  }

  public transition(to: SelectionLifecyclePhase): boolean {
    if (!this.canTransition(to)) {
      return false;
    }
    this.phase = to;
    return true;
  }

  public force(to: SelectionLifecyclePhase): void {
    this.phase = to;
  }

  public isActive(): boolean {
    return (
      this.phase === 'ready' ||
      this.phase === 'modifying' ||
      this.phase === 'committed' ||
      this.phase === 'committing'
    );
  }

  public isTerminal(): boolean {
    return this.phase === 'disposed';
  }
}
