export interface OperationMetricsSnapshot {
  readonly started: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly commits: number;
  readonly kernelAttempts: number;
  readonly retries: number;
  readonly totalDurationMs: number;
  readonly commitRate: number;
  readonly averageDurationMs: number;
}

/** Counters for operation lifecycle and commit rate. */
export class OperationMetrics {
  private started = 0;
  private succeeded = 0;
  private failed = 0;
  private cancelled = 0;
  private commits = 0;
  private kernelAttempts = 0;
  private retries = 0;
  private totalDurationMs = 0;

  public recordStart(): void {
    this.started += 1;
  }

  public recordSuccess(durationMs: number): void {
    this.succeeded += 1;
    this.totalDurationMs += Math.max(0, durationMs);
  }

  public recordFailure(): void {
    this.failed += 1;
  }

  public recordCancel(): void {
    this.cancelled += 1;
  }

  public recordCommit(): void {
    this.commits += 1;
  }

  public recordKernelAttempt(): void {
    this.kernelAttempts += 1;
  }

  public recordRetry(): void {
    this.retries += 1;
  }

  public snapshot(): OperationMetricsSnapshot {
    const commitRate = this.started === 0 ? 0 : this.commits / this.started;
    const averageDurationMs = this.succeeded === 0 ? 0 : this.totalDurationMs / this.succeeded;
    return {
      started: this.started,
      succeeded: this.succeeded,
      failed: this.failed,
      cancelled: this.cancelled,
      commits: this.commits,
      kernelAttempts: this.kernelAttempts,
      retries: this.retries,
      totalDurationMs: this.totalDurationMs,
      commitRate,
      averageDurationMs
    };
  }

  public reset(): void {
    this.started = 0;
    this.succeeded = 0;
    this.failed = 0;
    this.cancelled = 0;
    this.commits = 0;
    this.kernelAttempts = 0;
    this.retries = 0;
    this.totalDurationMs = 0;
  }
}
