export type ImportDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface ImportDiagnostic {
  readonly severity: ImportDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface ImportDiagnosticsSnapshot {
  readonly missingImporter: number;
  readonly validationFailures: number;
  readonly cancellations: number;
  readonly pipelineFailures: number;
  readonly warnings: readonly ImportDiagnostic[];
  readonly errors: readonly ImportDiagnostic[];
}

export class ImportDiagnostics {
  private missingImporter = 0;
  private validationFailures = 0;
  private cancellations = 0;
  private pipelineFailures = 0;
  private readonly warnings: ImportDiagnostic[] = [];
  private readonly errors: ImportDiagnostic[] = [];
  private readonly maxEntries: number;

  public constructor(maxEntries = 64) {
    this.maxEntries = maxEntries;
  }

  public recordMissingImporter(message: string, at: number): void {
    this.missingImporter += 1;
    this.error('missing-importer', message, at);
  }

  public recordValidationFailure(message: string, at: number): void {
    this.validationFailures += 1;
    this.error('validation', message, at);
  }

  public recordCancellation(message: string, at: number): void {
    this.cancellations += 1;
    this.warn('cancelled', message, at);
  }

  public recordPipelineFailure(message: string, at: number): void {
    this.pipelineFailures += 1;
    this.error('pipeline', message, at);
  }

  public warn(code: string, message: string, at: number): void {
    this.push(this.warnings, { severity: 'warning', code, message, at });
  }

  public error(code: string, message: string, at: number): void {
    this.push(this.errors, { severity: 'error', code, message, at });
  }

  public snapshot(): ImportDiagnosticsSnapshot {
    return Object.freeze({
      missingImporter: this.missingImporter,
      validationFailures: this.validationFailures,
      cancellations: this.cancellations,
      pipelineFailures: this.pipelineFailures,
      warnings: Object.freeze([...this.warnings]),
      errors: Object.freeze([...this.errors])
    });
  }

  public clear(): void {
    this.warnings.length = 0;
    this.errors.length = 0;
  }

  private push(list: ImportDiagnostic[], entry: ImportDiagnostic): void {
    list.push(Object.freeze(entry));
    while (list.length > this.maxEntries) {
      list.shift();
    }
  }
}
