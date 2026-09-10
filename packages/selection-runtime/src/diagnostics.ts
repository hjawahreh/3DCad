export type SelectionDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface SelectionDiagnostic {
  readonly severity: SelectionDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface SelectionDiagnosticsSnapshot {
  readonly invalidIds: number;
  readonly duplicateIds: number;
  readonly policyViolations: number;
  readonly snapshotMismatches: number;
  readonly warnings: readonly SelectionDiagnostic[];
  readonly errors: readonly SelectionDiagnostic[];
}

export class SelectionDiagnostics {
  private invalidIds = 0;
  private duplicateIds = 0;
  private policyViolations = 0;
  private snapshotMismatches = 0;
  private readonly warnings: SelectionDiagnostic[] = [];
  private readonly errors: SelectionDiagnostic[] = [];
  private readonly maxEntries: number;

  public constructor(maxEntries = 64) {
    this.maxEntries = maxEntries;
  }

  public recordInvalidIds(count: number, at: number): void {
    this.invalidIds += count;
    if (count > 0) {
      this.warn('invalid-id', `Rejected ${String(count)} invalid identifier(s)`, at);
    }
  }

  public recordDuplicates(count: number, at: number): void {
    this.duplicateIds += count;
    if (count > 0) {
      this.warn('duplicate-id', `Suppressed ${String(count)} duplicate identifier(s)`, at);
    }
  }

  public recordPolicyViolation(code: string, at: number): void {
    this.policyViolations += 1;
    this.warn('policy', code, at);
  }

  public recordSnapshotMismatch(message: string, at: number): void {
    this.snapshotMismatches += 1;
    this.error('snapshot-mismatch', message, at);
  }

  public warn(code: string, message: string, at: number): void {
    this.push(this.warnings, { severity: 'warning', code, message, at });
  }

  public error(code: string, message: string, at: number): void {
    this.push(this.errors, { severity: 'error', code, message, at });
  }

  public snapshot(): SelectionDiagnosticsSnapshot {
    return Object.freeze({
      invalidIds: this.invalidIds,
      duplicateIds: this.duplicateIds,
      policyViolations: this.policyViolations,
      snapshotMismatches: this.snapshotMismatches,
      warnings: Object.freeze([...this.warnings]),
      errors: Object.freeze([...this.errors])
    });
  }

  public clear(): void {
    this.warnings.length = 0;
    this.errors.length = 0;
  }

  private push(list: SelectionDiagnostic[], entry: SelectionDiagnostic): void {
    list.push(Object.freeze(entry));
    while (list.length > this.maxEntries) {
      list.shift();
    }
  }
}
