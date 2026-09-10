export type ProjectionDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface ProjectionDiagnostic {
  readonly severity: ProjectionDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export class ProjectionDiagnostics {
  private readonly entries: ProjectionDiagnostic[] = [];
  private projectionMs = 0;
  private revisionMs = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  public warn(code: string, message: string): void {
    this.push('warning', code, message);
  }

  public error(code: string, message: string): void {
    this.push('error', code, message);
  }

  public info(code: string, message: string): void {
    this.push('info', code, message);
  }

  public setTiming(projectionMs: number, revisionMs: number): void {
    this.projectionMs = projectionMs;
    this.revisionMs = revisionMs;
  }

  public setCache(hits: number, misses: number): void {
    this.cacheHits = hits;
    this.cacheMisses = misses;
  }

  public list(): readonly ProjectionDiagnostic[] {
    return [...this.entries];
  }

  public timing(): { readonly projectionMs: number; readonly revisionMs: number } {
    return { projectionMs: this.projectionMs, revisionMs: this.revisionMs };
  }

  public cache(): { readonly hits: number; readonly misses: number } {
    return { hits: this.cacheHits, misses: this.cacheMisses };
  }

  public clear(): void {
    this.entries.length = 0;
    this.projectionMs = 0;
    this.revisionMs = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  private push(
    severity: ProjectionDiagnosticSeverity,
    code: string,
    message: string
  ): void {
    this.entries.push(
      Object.freeze({
        severity,
        code,
        message,
        at: Date.now()
      })
    );
  }
}
