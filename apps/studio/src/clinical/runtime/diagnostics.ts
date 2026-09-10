/**
 * Clinical diagnostics — runtime health for the clinical layer.
 */

export type ClinicalDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface ClinicalDiagnostic {
  readonly id: string;
  readonly severity: ClinicalDiagnosticSeverity;
  readonly message: string;
  readonly source: string;
  readonly at: number;
}

export interface ClinicalDiagnosticsSnapshot {
  readonly logs: readonly ClinicalDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly toolCount: number;
  readonly enabledToolCount: number;
  readonly phase: string;
  readonly hasActiveCase: boolean;
}

export class ClinicalDiagnostics {
  private readonly logs: ClinicalDiagnostic[] = [];
  private serial = 0;
  private toolCount = 0;
  private enabledToolCount = 0;
  private phase = 'created';
  private hasActiveCase = false;

  public setToolStats(total: number, enabled: number): void {
    this.toolCount = total;
    this.enabledToolCount = enabled;
  }

  public setPhase(phase: string, hasActiveCase: boolean): void {
    this.phase = phase;
    this.hasActiveCase = hasActiveCase;
  }

  public record(
    severity: ClinicalDiagnosticSeverity,
    message: string,
    source: string,
    at = Date.now()
  ): ClinicalDiagnostic {
    this.serial += 1;
    const entry = Object.freeze({
      id: `clin-diag-${String(this.serial)}`,
      severity,
      message,
      source,
      at
    });
    this.logs.push(entry);
    if (this.logs.length > 400) {
      this.logs.shift();
    }
    return entry;
  }

  public snapshot(): ClinicalDiagnosticsSnapshot {
    let errorCount = 0;
    let warningCount = 0;
    for (const log of this.logs) {
      if (log.severity === 'error') {
        errorCount += 1;
      } else if (log.severity === 'warning') {
        warningCount += 1;
      }
    }
    return Object.freeze({
      logs: Object.freeze([...this.logs]),
      errorCount,
      warningCount,
      toolCount: this.toolCount,
      enabledToolCount: this.enabledToolCount,
      phase: this.phase,
      hasActiveCase: this.hasActiveCase
    });
  }
}
