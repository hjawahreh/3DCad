export type ViewportDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface ViewportDiagnostic {
  readonly severity: ViewportDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface ViewportDiagnosticsSnapshot {
  readonly backend: string | undefined;
  readonly deviceName: string;
  readonly vendor: string;
  readonly contextLossCount: number;
  readonly resizeCount: number;
  readonly invalidationCount: number;
  readonly renderCount: number;
  readonly droppedFrames: number;
  readonly lastFrameLatencyMs: number;
  readonly warnings: readonly ViewportDiagnostic[];
  readonly errors: readonly ViewportDiagnostic[];
}

/**
 * Session diagnostics journal (bounded).
 * Ownership: session-owned; clear on dispose.
 */
export class ViewportDiagnostics {
  private backend: string | undefined;
  private deviceName = 'unknown';
  private vendor = 'unknown';
  private contextLossCount = 0;
  private resizeCount = 0;
  private invalidationCount = 0;
  private renderCount = 0;
  private droppedFrames = 0;
  private lastFrameLatencyMs = 0;
  private readonly warnings: ViewportDiagnostic[] = [];
  private readonly errors: ViewportDiagnostic[] = [];
  private readonly maxEntries: number;

  public constructor(maxEntries = 64) {
    this.maxEntries = maxEntries;
  }

  public setBackendInfo(input: {
    readonly backend: string;
    readonly deviceName: string;
    readonly vendor: string;
  }): void {
    this.backend = input.backend;
    this.deviceName = input.deviceName;
    this.vendor = input.vendor;
  }

  public recordResize(): void {
    this.resizeCount += 1;
  }

  public recordInvalidation(): void {
    this.invalidationCount += 1;
  }

  public recordRender(latencyMs: number, dropped: boolean): void {
    this.renderCount += 1;
    this.lastFrameLatencyMs = latencyMs;
    if (dropped) {
      this.droppedFrames += 1;
    }
  }

  public recordContextLoss(): void {
    this.contextLossCount += 1;
  }

  public warn(code: string, message: string, at: number): void {
    this.push(this.warnings, { severity: 'warning', code, message, at });
  }

  public error(code: string, message: string, at: number): void {
    this.push(this.errors, { severity: 'error', code, message, at });
  }

  public snapshot(): ViewportDiagnosticsSnapshot {
    return Object.freeze({
      backend: this.backend,
      deviceName: this.deviceName,
      vendor: this.vendor,
      contextLossCount: this.contextLossCount,
      resizeCount: this.resizeCount,
      invalidationCount: this.invalidationCount,
      renderCount: this.renderCount,
      droppedFrames: this.droppedFrames,
      lastFrameLatencyMs: this.lastFrameLatencyMs,
      warnings: Object.freeze([...this.warnings]),
      errors: Object.freeze([...this.errors])
    });
  }

  public clear(): void {
    this.warnings.length = 0;
    this.errors.length = 0;
  }

  private push(list: ViewportDiagnostic[], entry: ViewportDiagnostic): void {
    list.push(Object.freeze(entry));
    while (list.length > this.maxEntries) {
      list.shift();
    }
  }
}
