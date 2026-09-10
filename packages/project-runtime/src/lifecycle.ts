export type ProjectLifecyclePhase =
  | 'created'
  | 'opening'
  | 'loading'
  | 'activating'
  | 'active'
  | 'modifying'
  | 'dirty'
  | 'autosaving'
  | 'saving'
  | 'closing'
  | 'closed'
  | 'disposed';

const ALLOWED: Readonly<Record<ProjectLifecyclePhase, readonly ProjectLifecyclePhase[]>> = {
  created: ['opening', 'disposed'],
  opening: ['loading', 'closed', 'disposed'],
  loading: ['activating', 'closing', 'disposed'],
  activating: ['active', 'closing', 'disposed'],
  active: ['modifying', 'dirty', 'saving', 'closing', 'disposed'],
  modifying: ['dirty', 'active', 'closing', 'disposed'],
  dirty: ['modifying', 'autosaving', 'saving', 'closing', 'disposed'],
  autosaving: ['dirty', 'active', 'closing', 'disposed'],
  saving: ['active', 'dirty', 'closing', 'disposed'],
  closing: ['closed', 'disposed'],
  closed: ['opening', 'disposed'],
  disposed: []
};

/**
 * Deterministic project session lifecycle.
 * Threading: single-owner.
 */
export class ProjectLifecycle {
  private phase: ProjectLifecyclePhase = 'created';

  public getPhase(): ProjectLifecyclePhase {
    return this.phase;
  }

  public canTransition(to: ProjectLifecyclePhase): boolean {
    return ALLOWED[this.phase].includes(to);
  }

  public transition(to: ProjectLifecyclePhase): boolean {
    if (!this.canTransition(to)) {
      return false;
    }
    this.phase = to;
    return true;
  }

  public force(to: ProjectLifecyclePhase): void {
    this.phase = to;
  }

  public isOpen(): boolean {
    return (
      this.phase === 'active' ||
      this.phase === 'modifying' ||
      this.phase === 'dirty' ||
      this.phase === 'autosaving' ||
      this.phase === 'saving' ||
      this.phase === 'loading' ||
      this.phase === 'activating'
    );
  }

  public isTerminal(): boolean {
    return this.phase === 'disposed';
  }
}
