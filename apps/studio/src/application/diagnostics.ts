/**
 * Application diagnostics — host-level summary over composed platform packages.
 */

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface ApplicationDiagnostic {
  readonly id: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly at: number;
  readonly source: string;
}

export interface PackageVersionInfo {
  readonly name: string;
  readonly version: string;
}

export interface ApplicationDiagnosticsSnapshot {
  readonly packages: readonly PackageVersionInfo[];
  readonly gpuBackend: string | undefined;
  readonly logs: readonly ApplicationDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
}

export const PLATFORM_PACKAGES: readonly PackageVersionInfo[] = Object.freeze([
  { name: '@cad-studio/platform-runtime', version: '0.1.0' },
  { name: '@cad-studio/project-runtime', version: '0.1.0' },
  { name: '@cad-studio/import-runtime', version: '0.1.0' },
  { name: '@cad-studio/scene', version: '0.1.0' },
  { name: '@cad-studio/viewport', version: '0.1.0' },
  { name: '@cad-studio/viewport-runtime', version: '0.1.0' },
  { name: '@cad-studio/interaction-runtime', version: '0.1.0' },
  { name: '@cad-studio/camera-runtime', version: '0.1.0' },
  { name: '@cad-studio/selection-runtime', version: '0.1.0' },
  { name: '@cad-studio/tool-runtime', version: '0.1.0' },
  { name: '@cad-studio/geometry-services', version: '0.1.0' },
  { name: '@cad-studio/kernel-bridge', version: '0.1.0' }
]);

export class ApplicationDiagnostics {
  private readonly logs: ApplicationDiagnostic[] = [];
  private gpuBackend: string | undefined;
  private serial = 0;

  public setGpuBackend(backend: string | undefined): void {
    this.gpuBackend = backend;
  }

  public record(
    severity: DiagnosticSeverity,
    message: string,
    source: string,
    at = Date.now()
  ): ApplicationDiagnostic {
    this.serial += 1;
    const entry: ApplicationDiagnostic = Object.freeze({
      id: `diag-${String(this.serial)}`,
      severity,
      message,
      at,
      source
    });
    this.logs.push(entry);
    if (this.logs.length > 500) {
      this.logs.shift();
    }
    return entry;
  }

  public snapshot(): ApplicationDiagnosticsSnapshot {
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
      packages: PLATFORM_PACKAGES,
      gpuBackend: this.gpuBackend,
      logs: Object.freeze([...this.logs]),
      errorCount,
      warningCount
    });
  }
}
