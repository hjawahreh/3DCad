export type ProjectDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface ProjectDiagnostic {
  readonly severity: ProjectDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface ProjectDiagnosticsSnapshot {
  readonly invalidStateCount: number;
  readonly failedTransitions: number;
  readonly autosaveFailures: number;
  readonly dirtyInconsistencies: number;
  readonly warnings: readonly ProjectDiagnostic[];
  readonly errors: readonly ProjectDiagnostic[];
}

export class ProjectDiagnostics {
  private invalidStateCount = 0;
  private failedTransitions = 0;
  private autosaveFailures = 0;
  private dirtyInconsistencies = 0;
  private readonly warnings: ProjectDiagnostic[] = [];
  private readonly errors: ProjectDiagnostic[] = [];
  private readonly maxEntries: number;

  public constructor(maxEntries = 64) {
    this.maxEntries = maxEntries;
  }

  public recordInvalidState(message: string, at: number): void {
    this.invalidStateCount += 1;
    this.error('invalid-state', message, at);
  }

  public recordFailedTransition(message: string, at: number): void {
    this.failedTransitions += 1;
    this.error('lifecycle', message, at);
  }

  public recordAutosaveFailure(message: string, at: number): void {
    this.autosaveFailures += 1;
    this.error('autosave', message, at);
  }

  public recordDirtyInconsistency(message: string, at: number): void {
    this.dirtyInconsistencies += 1;
    this.warn('dirty', message, at);
  }

  public warn(code: string, message: string, at: number): void {
    this.push(this.warnings, { severity: 'warning', code, message, at });
  }

  public error(code: string, message: string, at: number): void {
    this.push(this.errors, { severity: 'error', code, message, at });
  }

  public snapshot(): ProjectDiagnosticsSnapshot {
    return Object.freeze({
      invalidStateCount: this.invalidStateCount,
      failedTransitions: this.failedTransitions,
      autosaveFailures: this.autosaveFailures,
      dirtyInconsistencies: this.dirtyInconsistencies,
      warnings: Object.freeze([...this.warnings]),
      errors: Object.freeze([...this.errors])
    });
  }

  public clear(): void {
    this.warnings.length = 0;
    this.errors.length = 0;
  }

  private push(list: ProjectDiagnostic[], entry: ProjectDiagnostic): void {
    list.push(Object.freeze(entry));
    while (list.length > this.maxEntries) {
      list.shift();
    }
  }
}
