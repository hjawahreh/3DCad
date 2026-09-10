/**
 * Clinical display diagnostics + metrics.
 */

export class ClinicalDisplayDiagnostics {
  private readonly logs: Array<{
    readonly id: string;
    readonly severity: 'info' | 'warning' | 'error';
    readonly message: string;
    readonly at: number;
  }> = [];
  private serial = 0;
  private displayModeChanges = 0;
  private visibilityChanges = 0;
  private cameraTransitions = 0;
  private lastFrameTimeMs = 0;
  private lastRefreshMs = 0;

  public record(severity: 'info' | 'warning' | 'error', message: string, at = Date.now()): void {
    this.serial += 1;
    this.logs.push(Object.freeze({ id: `disp-${String(this.serial)}`, severity, message, at }));
    if (this.logs.length > 200) {
      this.logs.shift();
    }
  }

  public recordDisplayModeChange(mode: string): void {
    this.displayModeChanges += 1;
    this.record('info', `Display mode → ${mode}`);
  }

  public recordVisibilityChange(message: string): void {
    this.visibilityChanges += 1;
    this.record('info', message);
  }

  public recordCameraTransition(message: string): void {
    this.cameraTransitions += 1;
    this.record('info', message);
  }

  public recordFrame(frameTimeMs: number, refreshMs: number): void {
    this.lastFrameTimeMs = frameTimeMs;
    this.lastRefreshMs = refreshMs;
  }

  public snapshot() {
    return Object.freeze({
      logs: Object.freeze([...this.logs]),
      displayModeChanges: this.displayModeChanges,
      visibilityChanges: this.visibilityChanges,
      cameraTransitions: this.cameraTransitions,
      lastFrameTimeMs: this.lastFrameTimeMs,
      lastRefreshMs: this.lastRefreshMs
    });
  }
}

export class ClinicalDisplayMetrics {
  private viewportOpens = 0;
  private cameraFits = 0;
  private displayModeUsage = new Map<string, number>();
  private visibilityOps = 0;
  private totalFrameMs = 0;
  private frameSamples = 0;

  public recordViewportOpen(): void {
    this.viewportOpens += 1;
  }

  public recordCameraFit(): void {
    this.cameraFits += 1;
  }

  public recordDisplayMode(mode: string): void {
    this.displayModeUsage.set(mode, (this.displayModeUsage.get(mode) ?? 0) + 1);
  }

  public recordVisibilityOp(): void {
    this.visibilityOps += 1;
  }

  public recordFrameTime(ms: number): void {
    this.totalFrameMs += ms;
    this.frameSamples += 1;
  }

  public snapshot() {
    return Object.freeze({
      viewportOpens: this.viewportOpens,
      cameraFits: this.cameraFits,
      visibilityOps: this.visibilityOps,
      averageFrameTimeMs: this.frameSamples === 0 ? 0 : this.totalFrameMs / this.frameSamples,
      displayModeUsage: Object.freeze(Object.fromEntries(this.displayModeUsage))
    });
  }
}
