export interface ProjectMetricsSnapshot {
  readonly projectCount: number;
  readonly openTimeMs: number;
  readonly saveCount: number;
  readonly autosaveCount: number;
  readonly dirtyDurationMs: number;
  readonly sessionDurationMs: number;
}

export class ProjectMetrics {
  private projectCount = 0;
  private openStartedAt: number | undefined;
  private openTimeMs = 0;
  private saveCount = 0;
  private autosaveCount = 0;
  private dirtyDurationMs = 0;
  private sessionStartedAt: number | undefined;

  public beginSession(at: number): void {
    this.sessionStartedAt = at;
    this.projectCount += 1;
  }

  public beginOpen(at: number): void {
    this.openStartedAt = at;
  }

  public endOpen(at: number): void {
    if (this.openStartedAt !== undefined) {
      this.openTimeMs = at - this.openStartedAt;
      this.openStartedAt = undefined;
    }
  }

  public recordSave(): void {
    this.saveCount += 1;
  }

  public recordAutosave(): void {
    this.autosaveCount += 1;
  }

  public recordDirtyDuration(ms: number): void {
    this.dirtyDurationMs = ms;
  }

  public snapshot(now: number): ProjectMetricsSnapshot {
    return Object.freeze({
      projectCount: this.projectCount,
      openTimeMs: this.openTimeMs,
      saveCount: this.saveCount,
      autosaveCount: this.autosaveCount,
      dirtyDurationMs: this.dirtyDurationMs,
      sessionDurationMs:
        this.sessionStartedAt === undefined ? 0 : Math.max(0, now - this.sessionStartedAt)
    });
  }

  public reset(): void {
    this.projectCount = 0;
    this.openStartedAt = undefined;
    this.openTimeMs = 0;
    this.saveCount = 0;
    this.autosaveCount = 0;
    this.dirtyDurationMs = 0;
    this.sessionStartedAt = undefined;
  }
}
