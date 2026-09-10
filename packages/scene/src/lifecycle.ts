export type ProjectionLifecyclePhase =
  | 'idle'
  | 'projecting'
  | 'ready'
  | 'disposed';

/**
 * Explicit projection lifecycle. Scene never mutates domain; lifecycle tracks engine state only.
 */
export class ProjectionLifecycle {
  private phase: ProjectionLifecyclePhase = 'idle';

  public getPhase(): ProjectionLifecyclePhase {
    return this.phase;
  }

  public beginProjection(): boolean {
    if (this.phase === 'disposed' || this.phase === 'projecting') {
      return false;
    }
    this.phase = 'projecting';
    return true;
  }

  public completeProjection(): void {
    if (this.phase === 'projecting') {
      this.phase = 'ready';
    }
  }

  public failProjection(): void {
    if (this.phase === 'projecting') {
      this.phase = 'idle';
    }
  }

  public dispose(): void {
    this.phase = 'disposed';
  }
}
