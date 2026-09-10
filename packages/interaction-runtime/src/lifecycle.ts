export type InteractionLifecyclePhase =
  | 'created'
  | 'initializing'
  | 'ready'
  | 'active'
  | 'paused'
  | 'shutting-down'
  | 'shutdown'
  | 'disposed';

const ALLOWED: Readonly<Record<InteractionLifecyclePhase, readonly InteractionLifecyclePhase[]>> = {
  created: ['initializing', 'disposed'],
  initializing: ['ready', 'disposed'],
  ready: ['active', 'paused', 'shutting-down', 'disposed'],
  active: ['paused', 'shutting-down', 'disposed'],
  paused: ['active', 'shutting-down', 'disposed'],
  'shutting-down': ['shutdown', 'disposed'],
  shutdown: ['disposed'],
  disposed: []
};

/**
 * Deterministic lifecycle for an interaction session.
 * Threading: single-owner.
 */
export class InteractionLifecycle {
  private phase: InteractionLifecyclePhase = 'created';

  public getPhase(): InteractionLifecyclePhase {
    return this.phase;
  }

  public canTransition(to: InteractionLifecyclePhase): boolean {
    return ALLOWED[this.phase].includes(to);
  }

  public transition(to: InteractionLifecyclePhase): boolean {
    if (!this.canTransition(to)) {
      return false;
    }
    this.phase = to;
    return true;
  }

  public force(to: InteractionLifecyclePhase): void {
    this.phase = to;
  }

  public isAcceptingInput(): boolean {
    return this.phase === 'active';
  }

  public isTerminal(): boolean {
    return this.phase === 'shutdown' || this.phase === 'disposed';
  }
}
