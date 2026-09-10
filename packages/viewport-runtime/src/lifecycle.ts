export type ViewportLifecyclePhase =
  | 'created'
  | 'initializing'
  | 'initialized'
  | 'configuring'
  | 'configured'
  | 'attaching'
  | 'attached'
  | 'session-ready'
  | 'running'
  | 'paused'
  | 'resizing'
  | 'invalidating'
  | 'shutting-down'
  | 'shutdown'
  | 'disposed';

const ALLOWED: Readonly<Record<ViewportLifecyclePhase, readonly ViewportLifecyclePhase[]>> = {
  created: ['initializing', 'disposed'],
  initializing: ['initialized', 'disposed'],
  initialized: ['configuring', 'disposed'],
  configuring: ['configured', 'disposed'],
  configured: ['attaching', 'disposed'],
  attaching: ['attached', 'disposed'],
  attached: ['session-ready', 'disposed'],
  'session-ready': ['running', 'paused', 'shutting-down', 'disposed'],
  running: ['paused', 'resizing', 'invalidating', 'shutting-down', 'disposed'],
  paused: ['running', 'resizing', 'invalidating', 'shutting-down', 'disposed'],
  resizing: ['running', 'paused', 'disposed'],
  invalidating: ['running', 'paused', 'disposed'],
  'shutting-down': ['shutdown', 'disposed'],
  shutdown: ['disposed'],
  disposed: []
};

/**
 * Deterministic lifecycle state machine for a viewport session.
 * Threading: single-owner; no internal synchronization.
 */
export class ViewportLifecycle {
  private phase: ViewportLifecyclePhase = 'created';

  public getPhase(): ViewportLifecyclePhase {
    return this.phase;
  }

  public canTransition(to: ViewportLifecyclePhase): boolean {
    return ALLOWED[this.phase].includes(to);
  }

  public transition(to: ViewportLifecyclePhase): boolean {
    if (!this.canTransition(to)) {
      return false;
    }
    this.phase = to;
    return true;
  }

  public force(to: ViewportLifecyclePhase): void {
    this.phase = to;
  }

  public isActive(): boolean {
    return this.phase === 'running' || this.phase === 'paused' || this.phase === 'resizing' || this.phase === 'invalidating';
  }

  public isTerminal(): boolean {
    return this.phase === 'shutdown' || this.phase === 'disposed';
  }
}
