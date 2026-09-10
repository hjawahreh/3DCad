/**
 * Application metrics — startup and session counters for the host.
 */

export interface ApplicationMetricsSnapshot {
  readonly startupDurationMs: number;
  readonly bootstrapCount: number;
  readonly projectCreateCount: number;
  readonly projectCloseCount: number;
  readonly importAttemptCount: number;
  readonly commandInvokeCount: number;
  readonly viewportAttachCount: number;
}

export class ApplicationMetrics {
  private startupDurationMs = 0;
  private bootstrapCount = 0;
  private projectCreateCount = 0;
  private projectCloseCount = 0;
  private importAttemptCount = 0;
  private commandInvokeCount = 0;
  private viewportAttachCount = 0;

  public recordStartup(durationMs: number): void {
    this.startupDurationMs = durationMs;
    this.bootstrapCount += 1;
  }

  public recordProjectCreate(): void {
    this.projectCreateCount += 1;
  }

  public recordProjectClose(): void {
    this.projectCloseCount += 1;
  }

  public recordImportAttempt(): void {
    this.importAttemptCount += 1;
  }

  public recordCommandInvoke(): void {
    this.commandInvokeCount += 1;
  }

  public recordViewportAttach(): void {
    this.viewportAttachCount += 1;
  }

  public snapshot(): ApplicationMetricsSnapshot {
    return Object.freeze({
      startupDurationMs: this.startupDurationMs,
      bootstrapCount: this.bootstrapCount,
      projectCreateCount: this.projectCreateCount,
      projectCloseCount: this.projectCloseCount,
      importAttemptCount: this.importAttemptCount,
      commandInvokeCount: this.commandInvokeCount,
      viewportAttachCount: this.viewportAttachCount
    });
  }
}
