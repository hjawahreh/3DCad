/**
 * Coalesced frame invalidation queue.
 * Reasons are merged; count is capped to avoid unbounded growth.
 */
export class FrameInvalidation {
  private pending = false;
  private reasons = new Set<string>();
  private totalCount = 0;
  private readonly maxReasons: number;

  public constructor(maxReasons = 64) {
    this.maxReasons = maxReasons;
  }

  public invalidate(reason = 'unspecified'): void {
    this.pending = true;
    this.totalCount += 1;
    if (this.reasons.size < this.maxReasons) {
      this.reasons.add(reason);
    }
  }

  public isPending(): boolean {
    return this.pending;
  }

  public consume(): readonly string[] {
    if (!this.pending) {
      return [];
    }
    const list = Object.freeze([...this.reasons]);
    this.pending = false;
    this.reasons.clear();
    return list;
  }

  public peekReasons(): readonly string[] {
    return Object.freeze([...this.reasons]);
  }

  public getTotalCount(): number {
    return this.totalCount;
  }

  public clear(): void {
    this.pending = false;
    this.reasons.clear();
  }
}
