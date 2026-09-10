/**
 * Segmentation diagnostics and metrics.
 */

export class ClinicalSegmentationDiagnostics {
  private sessions = 0;
  private inferences = 0;
  private accepts = 0;
  private rejects = 0;
  private failures = 0;
  private lastError: string | undefined;

  public recordSessionStart(_providerId: string): void {
    this.sessions += 1;
  }

  public recordInferenceOk(_providerId: string, _instances: number): void {
    this.inferences += 1;
  }

  public recordAccept(_instances: number): void {
    this.accepts += 1;
  }

  public recordRejected(): void {
    this.rejects += 1;
  }

  public recordFailure(message: string): void {
    this.failures += 1;
    this.lastError = message;
  }

  public snapshot() {
    return Object.freeze({
      sessions: this.sessions,
      inferences: this.inferences,
      accepts: this.accepts,
      rejects: this.rejects,
      failures: this.failures,
      lastError: this.lastError
    });
  }
}

export class ClinicalSegmentationMetrics {
  private starts = 0;
  private accepted = 0;
  private failed = 0;
  private totalInferenceMs = 0;
  private totalInstances = 0;

  public recordStart(_providerId: string): void {
    this.starts += 1;
  }

  public recordInference(ms: number, instances: number): void {
    this.totalInferenceMs += ms;
    this.totalInstances += instances;
  }

  public recordAccepted(): void {
    this.accepted += 1;
  }

  public recordFailed(): void {
    this.failed += 1;
  }

  public snapshot() {
    return Object.freeze({
      starts: this.starts,
      accepted: this.accepted,
      failed: this.failed,
      meanInferenceMs:
        this.starts === 0 ? 0 : this.totalInferenceMs / Math.max(1, this.inferencesCount()),
      totalInstances: this.totalInstances
    });
  }

  private inferencesCount(): number {
    return this.accepted + this.failed + Math.max(0, this.starts - this.accepted - this.failed);
  }
}
