export type InteractionDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface InteractionDiagnostic {
  readonly severity: InteractionDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface InteractionDiagnosticsSnapshot {
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly lostEvents: number;
  readonly captureFailures: number;
  readonly lastDispatchMs: number;
  readonly queueDepth: number;
  readonly activePointers: number;
  readonly warnings: readonly InteractionDiagnostic[];
  readonly errors: readonly InteractionDiagnostic[];
}

/**
 * Session diagnostics journal (bounded).
 */
export class InteractionDiagnostics {
  private readonly eventCounts: Record<string, number> = {};
  private lostEvents = 0;
  private captureFailures = 0;
  private lastDispatchMs = 0;
  private queueDepth = 0;
  private activePointers = 0;
  private readonly warnings: InteractionDiagnostic[] = [];
  private readonly errors: InteractionDiagnostic[] = [];
  private readonly maxEntries: number;

  public constructor(maxEntries = 64) {
    this.maxEntries = maxEntries;
  }

  public recordEvent(kind: string): void {
    this.eventCounts[kind] = (this.eventCounts[kind] ?? 0) + 1;
  }

  public recordLost(reason: string, at: number): void {
    this.lostEvents += 1;
    this.warn('lost-event', reason, at);
  }

  public recordCaptureFailure(message: string, at: number): void {
    this.captureFailures += 1;
    this.error('capture-failure', message, at);
  }

  public setDispatchTiming(ms: number): void {
    this.lastDispatchMs = ms;
  }

  public setQueueDepth(depth: number): void {
    this.queueDepth = depth;
  }

  public setActivePointers(count: number): void {
    this.activePointers = count;
  }

  public warn(code: string, message: string, at: number): void {
    this.push(this.warnings, { severity: 'warning', code, message, at });
  }

  public error(code: string, message: string, at: number): void {
    this.push(this.errors, { severity: 'error', code, message, at });
  }

  public snapshot(): InteractionDiagnosticsSnapshot {
    return Object.freeze({
      eventCounts: Object.freeze({ ...this.eventCounts }),
      lostEvents: this.lostEvents,
      captureFailures: this.captureFailures,
      lastDispatchMs: this.lastDispatchMs,
      queueDepth: this.queueDepth,
      activePointers: this.activePointers,
      warnings: Object.freeze([...this.warnings]),
      errors: Object.freeze([...this.errors])
    });
  }

  public clear(): void {
    this.warnings.length = 0;
    this.errors.length = 0;
  }

  private push(list: InteractionDiagnostic[], entry: InteractionDiagnostic): void {
    list.push(Object.freeze(entry));
    while (list.length > this.maxEntries) {
      list.shift();
    }
  }
}
