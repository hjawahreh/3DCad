/**
 * ClinicalTrimDiagnostics + ClinicalTrimMetrics.
 */

export class ClinicalTrimDiagnostics {
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
  private validationFailures = 0;
  private totalKernelMs = 0;
  private kernelSamples = 0;
  private totalBoundaryPoints = 0;
  private boundarySamples = 0;

  public record(severity: 'info' | 'warning' | 'error', message: string, at = Date.now()): void {
    this.serial += 1;
    this.logs.push(Object.freeze({ id: `trim-${String(this.serial)}`, severity, message, at }));
    if (this.logs.length > 200) {
      this.logs.shift();
    }
  }

  public recordSessionStart(): void {
    this.sessions += 1;
    this.record('info', 'Trim session started');
  }

  public recordCancelled(): void {
    this.cancelled += 1;
    this.record('info', 'Trim session cancelled');
  }

  public recordCommit(durationMs: number, boundaryPoints: number, kernelMs: number): void {
    this.commits += 1;
    this.totalBoundaryPoints += boundaryPoints;
    this.boundarySamples += 1;
    this.totalKernelMs += kernelMs;
    this.kernelSamples += 1;
    this.record(
      'info',
      `Trim committed (${durationMs.toFixed(0)}ms, ${String(boundaryPoints)} pts, kernel ${kernelMs.toFixed(0)}ms)`
    );
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
      validationFailures: this.validationFailures,
      averageKernelMs: this.kernelSamples === 0 ? 0 : this.totalKernelMs / this.kernelSamples,
      averageBoundaryPoints:
        this.boundarySamples === 0 ? 0 : this.totalBoundaryPoints / this.boundarySamples
    });
  }
}

export class ClinicalTrimMetrics {
  private trimOperations = 0;
  private accepted = 0;
  private cancelled = 0;
  private totalDurationMs = 0;
  private durationSamples = 0;
  private totalPoints = 0;
  private pointSamples = 0;
  private totalKernelMs = 0;
  private kernelSamples = 0;

  public recordTrimStart(): void {
    this.trimOperations += 1;
  }

  public recordAccepted(durationMs: number, boundaryPoints: number, kernelMs: number): void {
    this.accepted += 1;
    this.totalDurationMs += durationMs;
    this.durationSamples += 1;
    this.totalPoints += boundaryPoints;
    this.pointSamples += 1;
    this.totalKernelMs += kernelMs;
    this.kernelSamples += 1;
  }

  public recordCancelled(): void {
    this.cancelled += 1;
  }

  public snapshot() {
    return Object.freeze({
      trimOperations: this.trimOperations,
      accepted: this.accepted,
      cancelled: this.cancelled,
      averageTrimDurationMs:
        this.durationSamples === 0 ? 0 : this.totalDurationMs / this.durationSamples,
      averageBoundaryPoints: this.pointSamples === 0 ? 0 : this.totalPoints / this.pointSamples,
      averageKernelMs: this.kernelSamples === 0 ? 0 : this.totalKernelMs / this.kernelSamples
    });
  }
}
