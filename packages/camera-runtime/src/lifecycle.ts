export type CameraLifecyclePhase =
  | 'created'
  | 'initializing'
  | 'initialized'
  | 'configuring'
  | 'configured'
  | 'attaching'
  | 'attached'
  | 'synchronizing'
  | 'ready'
  | 'navigating'
  | 'animating'
  | 'paused'
  | 'detaching'
  | 'detached'
  | 'shutting-down'
  | 'shutdown'
  | 'disposed';

const ALLOWED: Readonly<Record<CameraLifecyclePhase, readonly CameraLifecyclePhase[]>> = {
  created: ['initializing', 'disposed'],
  initializing: ['initialized', 'disposed'],
  initialized: ['configuring', 'disposed'],
  configuring: ['configured', 'disposed'],
  configured: ['attaching', 'disposed'],
  attaching: ['attached', 'disposed'],
  attached: ['synchronizing', 'ready', 'disposed'],
  synchronizing: ['ready', 'disposed'],
  ready: ['navigating', 'animating', 'paused', 'detaching', 'shutting-down', 'disposed'],
  navigating: ['ready', 'animating', 'paused', 'disposed'],
  animating: ['ready', 'navigating', 'paused', 'disposed'],
  paused: ['ready', 'navigating', 'animating', 'detaching', 'shutting-down', 'disposed'],
  detaching: ['detached', 'disposed'],
  detached: ['attaching', 'shutting-down', 'disposed'],
  'shutting-down': ['shutdown', 'disposed'],
  shutdown: ['disposed'],
  disposed: []
};

/**
 * Deterministic camera session lifecycle.
 * Threading: single-owner.
 */
export class CameraLifecycle {
  private phase: CameraLifecyclePhase = 'created';

  public getPhase(): CameraLifecyclePhase {
    return this.phase;
  }

  public canTransition(to: CameraLifecyclePhase): boolean {
    return ALLOWED[this.phase].includes(to);
  }

  public transition(to: CameraLifecyclePhase): boolean {
    if (!this.canTransition(to)) {
      return false;
    }
    this.phase = to;
    return true;
  }

  public force(to: CameraLifecyclePhase): void {
    this.phase = to;
  }

  public isInteractive(): boolean {
    return (
      this.phase === 'ready' ||
      this.phase === 'navigating' ||
      this.phase === 'animating'
    );
  }

  public isTerminal(): boolean {
    return this.phase === 'shutdown' || this.phase === 'disposed';
  }
}
