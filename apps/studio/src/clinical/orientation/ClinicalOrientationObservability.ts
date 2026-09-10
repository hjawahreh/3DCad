/**
 * Clinical orientation diagnostics + metrics.
 */

export class ClinicalOrientationDiagnostics {
  private readonly logs: Array<{
    readonly id: string;
    readonly severity: 'info' | 'warning' | 'error';
    readonly message: string;
    readonly at: number;
  }> = [];
  private serial = 0;
  private sessions = 0;
  private accepted = 0;
  private cancelled = 0;
  private validationFailures = 0;
  private undoRedo = 0;
  private totalRotationMs = 0;
  private rotationSamples = 0;

  public record(severity: 'info' | 'warning' | 'error', message: string, at = Date.now()): void {
    this.serial += 1;
    this.logs.push(Object.freeze({ id: `orient-${String(this.serial)}`, severity, message, at }));
    if (this.logs.length > 200) {
      this.logs.shift();
    }
  }

  public recordSessionStart(): void {
    this.sessions += 1;
    this.record('info', 'Orientation session started');
  }

  public recordAccepted(durationMs: number): void {
    this.accepted += 1;
    this.totalRotationMs += durationMs;
    this.rotationSamples += 1;
    this.record('info', `Orientation accepted (${durationMs.toFixed(0)}ms)`);
  }

  public recordCancelled(): void {
    this.cancelled += 1;
    this.record('info', 'Orientation cancelled');
  }

  public recordValidationFailure(message: string): void {
    this.validationFailures += 1;
    this.record('warning', message);
  }

  public recordUndoRedo(action: 'undo' | 'redo'): void {
    this.undoRedo += 1;
    this.record('info', `Orientation ${action}`);
  }

  public snapshot() {
    return Object.freeze({
      logs: Object.freeze([...this.logs]),
      sessions: this.sessions,
      accepted: this.accepted,
      cancelled: this.cancelled,
      validationFailures: this.validationFailures,
      undoRedo: this.undoRedo,
      averageRotationTimeMs:
        this.rotationSamples === 0 ? 0 : this.totalRotationMs / this.rotationSamples
    });
  }
}

export class ClinicalOrientationMetrics {
  private orientationCount = 0;
  private totalCompletionMs = 0;
  private completionSamples = 0;
  private resetUsage = 0;
  private snapUsage = 0;
  private axisUsage = new Map<string, number>();

  public recordOrientationComplete(durationMs: number): void {
    this.orientationCount += 1;
    this.totalCompletionMs += durationMs;
    this.completionSamples += 1;
  }

  public recordReset(): void {
    this.resetUsage += 1;
  }

  public recordSnap(): void {
    this.snapUsage += 1;
  }

  public recordAxis(axis: string): void {
    this.axisUsage.set(axis, (this.axisUsage.get(axis) ?? 0) + 1);
  }

  public snapshot() {
    return Object.freeze({
      orientationCount: this.orientationCount,
      averageCompletionTimeMs:
        this.completionSamples === 0 ? 0 : this.totalCompletionMs / this.completionSamples,
      resetUsage: this.resetUsage,
      snapUsage: this.snapUsage,
      axisUsage: Object.freeze(Object.fromEntries(this.axisUsage))
    });
  }
}
