/**
 * Tracks dirty state and dirty duration for a project session.
 */
export class DirtyStateManager {
  private dirty = false;
  private dirtySince: number | undefined;
  private markCount = 0;
  private clearCount = 0;

  public isDirty(): boolean {
    return this.dirty;
  }

  public markDirty(at: number): boolean {
    const wasClean = !this.dirty;
    this.dirty = true;
    this.markCount += 1;
    if (wasClean) {
      this.dirtySince = at;
    }
    return wasClean;
  }

  public clearDirty(): boolean {
    const wasDirty = this.dirty;
    this.dirty = false;
    this.dirtySince = undefined;
    if (wasDirty) {
      this.clearCount += 1;
    }
    return wasDirty;
  }

  public dirtyDurationMs(now: number): number {
    if (!this.dirty || this.dirtySince === undefined) {
      return 0;
    }
    return Math.max(0, now - this.dirtySince);
  }

  public getMarkCount(): number {
    return this.markCount;
  }

  public getClearCount(): number {
    return this.clearCount;
  }
}
