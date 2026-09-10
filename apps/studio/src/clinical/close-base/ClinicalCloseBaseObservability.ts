/**
 * ClinicalCloseBaseDiagnostics + ClinicalCloseBaseMetrics.
 */

import type { CloseBaseStrategyId } from './ClinicalCloseBaseStrategy.js';

export class ClinicalCloseBaseDiagnostics {
  private readonly logs: Array<{
    readonly id: string;
    readonly severity: 'info' | 'warning' | 'error';
    readonly message: string;
    readonly at: number;
  }> = [];
  private serial = 0;
  private sessions = 0;
  private cancelled = 0;
  private commits = 0;
  private commitFailures = 0;
  private validationFailures = 0;
  private totalKernelMs = 0;
  private kernelSamples = 0;
  private totalOperationMs = 0;
  private operationSamples = 0;
  private totalPreviewMs = 0;
  private previewSamples = 0;
  private readonly strategyUsage = new Map<string, number>();

  public record(severity: 'info' | 'warning' | 'error', message: string, at = Date.now()): void {
    this.serial += 1;
    this.logs.push(Object.freeze({ id: `close-base-${String(this.serial)}`, severity, message, at }));
    if (this.logs.length > 200) {
      this.logs.shift();
    }
  }

  public recordSessionStart(strategy: CloseBaseStrategyId): void {
    this.sessions += 1;
    this.strategyUsage.set(strategy, (this.strategyUsage.get(strategy) ?? 0) + 1);
    this.record('info', `Close Base session started (${strategy})`);
  }

  public recordCancelled(): void {
    this.cancelled += 1;
    this.record('info', 'Close Base cancelled');
  }

  public recordCommit(input: {
    readonly durationMs: number;
    readonly kernelMs: number;
    readonly previewMs: number;
    readonly strategy: CloseBaseStrategyId;
  }): void {
    this.commits += 1;
    this.totalOperationMs += input.durationMs;
    this.operationSamples += 1;
    this.totalKernelMs += input.kernelMs;
    this.kernelSamples += 1;
    this.totalPreviewMs += input.previewMs;
    this.previewSamples += 1;
    this.record(
      'info',
      `Close Base committed (${input.strategy}, ${input.durationMs.toFixed(0)}ms)`
    );
  }

  public recordCommitFailure(message: string): void {
    this.commitFailures += 1;
    this.record('error', message);
  }

  public recordValidationFailure(message: string): void {
    this.validationFailures += 1;
    this.record('warning', message);
  }

  public snapshot() {
    return Object.freeze({
      logs: Object.freeze([...this.logs]),
      sessions: this.sessions,
      cancelled: this.cancelled,
      commits: this.commits,
      commitFailures: this.commitFailures,
      validationFailures: this.validationFailures,
      averageKernelMs: this.kernelSamples === 0 ? 0 : this.totalKernelMs / this.kernelSamples,
      averageOperationMs:
        this.operationSamples === 0 ? 0 : this.totalOperationMs / this.operationSamples,
      averagePreviewMs: this.previewSamples === 0 ? 0 : this.totalPreviewMs / this.previewSamples,
      strategyUsage: Object.freeze(Object.fromEntries(this.strategyUsage))
    });
  }
}

export class ClinicalCloseBaseMetrics {
  private totalOperations = 0;
  private successful = 0;
  private failed = 0;
  private cancelled = 0;
  private totalDurationMs = 0;
  private durationSamples = 0;
  private totalKernelMs = 0;
  private kernelSamples = 0;
  private totalPreviewMs = 0;
  private previewSamples = 0;
  private parameterChanges = 0;
  private readonly strategyUsage = new Map<string, number>();

  public recordStart(strategy: CloseBaseStrategyId): void {
    this.totalOperations += 1;
    this.strategyUsage.set(strategy, (this.strategyUsage.get(strategy) ?? 0) + 1);
  }

  public recordSuccess(durationMs: number, kernelMs: number, previewMs: number): void {
    this.successful += 1;
    this.totalDurationMs += durationMs;
    this.durationSamples += 1;
    this.totalKernelMs += kernelMs;
    this.kernelSamples += 1;
    this.totalPreviewMs += previewMs;
    this.previewSamples += 1;
  }

  public recordFailed(): void {
    this.failed += 1;
  }

  public recordCancelled(): void {
    this.cancelled += 1;
  }

  public recordParameterChange(strategy: CloseBaseStrategyId): void {
    this.parameterChanges += 1;
    this.strategyUsage.set(strategy, (this.strategyUsage.get(strategy) ?? 0) + 1);
  }

  public snapshot() {
    return Object.freeze({
      totalOperations: this.totalOperations,
      successful: this.successful,
      failed: this.failed,
      cancelled: this.cancelled,
      averageOperationDurationMs:
        this.durationSamples === 0 ? 0 : this.totalDurationMs / this.durationSamples,
      averageKernelMs: this.kernelSamples === 0 ? 0 : this.totalKernelMs / this.kernelSamples,
      averagePreviewMs: this.previewSamples === 0 ? 0 : this.totalPreviewMs / this.previewSamples,
      parameterChanges: this.parameterChanges,
      strategyUsage: Object.freeze(Object.fromEntries(this.strategyUsage))
    });
  }
}
