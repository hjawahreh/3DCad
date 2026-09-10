/**
 * Clinical metrics.
 */

export interface ClinicalMetricsSnapshot {
  readonly caseCreateCount: number;
  readonly caseCloseCount: number;
  readonly toolActivateCount: number;
  readonly commandInvokeCount: number;
  readonly bootstrapDurationMs: number;
  readonly activeCaseCount: number;
}

export class ClinicalMetrics {
  private caseCreateCount = 0;
  private caseCloseCount = 0;
  private toolActivateCount = 0;
  private commandInvokeCount = 0;
  private bootstrapDurationMs = 0;
  private activeCaseCount = 0;

  public recordBootstrap(durationMs: number): void {
    this.bootstrapDurationMs = durationMs;
  }

  public recordCaseCreate(): void {
    this.caseCreateCount += 1;
    this.activeCaseCount = 1;
  }

  public recordCaseClose(): void {
    this.caseCloseCount += 1;
    this.activeCaseCount = 0;
  }

  public recordToolActivate(): void {
    this.toolActivateCount += 1;
  }

  public recordCommandInvoke(): void {
    this.commandInvokeCount += 1;
  }

  public snapshot(): ClinicalMetricsSnapshot {
    return Object.freeze({
      caseCreateCount: this.caseCreateCount,
      caseCloseCount: this.caseCloseCount,
      toolActivateCount: this.toolActivateCount,
      commandInvokeCount: this.commandInvokeCount,
      bootstrapDurationMs: this.bootstrapDurationMs,
      activeCaseCount: this.activeCaseCount
    });
  }
}
