export type CameraDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface CameraDiagnostic {
  readonly severity: CameraDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface CameraDiagnosticsSnapshot {
  readonly invalidStateCount: number;
  readonly projectionErrors: number;
  readonly constraintViolations: number;
  readonly syncFailures: number;
  readonly warnings: readonly CameraDiagnostic[];
  readonly errors: readonly CameraDiagnostic[];
}

export class CameraDiagnostics {
  private invalidStateCount = 0;
  private projectionErrors = 0;
  private constraintViolations = 0;
  private syncFailures = 0;
  private readonly warnings: CameraDiagnostic[] = [];
  private readonly errors: CameraDiagnostic[] = [];
  private readonly maxEntries: number;

  public constructor(maxEntries = 64) {
    this.maxEntries = maxEntries;
  }

  public recordInvalidState(message: string, at: number): void {
    this.invalidStateCount += 1;
    this.error('invalid-state', message, at);
  }

  public recordProjectionError(message: string, at: number): void {
    this.projectionErrors += 1;
    this.error('projection', message, at);
  }

  public recordConstraintViolation(code: string, at: number): void {
    this.constraintViolations += 1;
    this.warn('constraint', code, at);
  }

  public recordSyncFailure(message: string, at: number): void {
    this.syncFailures += 1;
    this.error('sync', message, at);
  }

  public warn(code: string, message: string, at: number): void {
    this.push(this.warnings, { severity: 'warning', code, message, at });
  }

  public error(code: string, message: string, at: number): void {
    this.push(this.errors, { severity: 'error', code, message, at });
  }

  public snapshot(): CameraDiagnosticsSnapshot {
    return Object.freeze({
      invalidStateCount: this.invalidStateCount,
      projectionErrors: this.projectionErrors,
      constraintViolations: this.constraintViolations,
      syncFailures: this.syncFailures,
      warnings: Object.freeze([...this.warnings]),
      errors: Object.freeze([...this.errors])
    });
  }

  public clear(): void {
    this.warnings.length = 0;
    this.errors.length = 0;
  }

  private push(list: CameraDiagnostic[], entry: CameraDiagnostic): void {
    list.push(Object.freeze(entry));
    while (list.length > this.maxEntries) {
      list.shift();
    }
  }
}
