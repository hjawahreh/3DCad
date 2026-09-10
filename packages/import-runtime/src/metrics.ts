export interface ImportMetricsSnapshot {
  readonly importCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly cancellationCount: number;
  readonly averageDurationMs: number;
  readonly activeImports: number;
}

export class ImportMetrics {
  private importCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private cancellationCount = 0;
  private totalDurationMs = 0;
  private activeImports = 0;

  public begin(): void {
    this.importCount += 1;
    this.activeImports += 1;
  }

  public endSuccess(durationMs: number): void {
    this.successCount += 1;
    this.totalDurationMs += durationMs;
    this.activeImports = Math.max(0, this.activeImports - 1);
  }

  public endFailure(durationMs: number): void {
    this.failureCount += 1;
    this.totalDurationMs += durationMs;
    this.activeImports = Math.max(0, this.activeImports - 1);
  }

  public endCancelled(durationMs: number): void {
    this.cancellationCount += 1;
    this.totalDurationMs += durationMs;
    this.activeImports = Math.max(0, this.activeImports - 1);
  }

  public snapshot(): ImportMetricsSnapshot {
    const completed = this.successCount + this.failureCount + this.cancellationCount;
    return Object.freeze({
      importCount: this.importCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      cancellationCount: this.cancellationCount,
      averageDurationMs: completed === 0 ? 0 : this.totalDurationMs / completed,
      activeImports: this.activeImports
    });
  }

  public reset(): void {
    this.importCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.cancellationCount = 0;
    this.totalDurationMs = 0;
    this.activeImports = 0;
  }
}
