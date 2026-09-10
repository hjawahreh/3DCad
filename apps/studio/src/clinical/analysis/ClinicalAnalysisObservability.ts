/**
 * Analysis diagnostics + metrics.
 */

export class ClinicalAnalysisDiagnostics {
  private readonly logs: { readonly level: string; readonly message: string; readonly at: number }[] =
    [];

  public record(level: string, message: string): void {
    this.logs.push(Object.freeze({ level, message, at: Date.now() }));
  }

  public snapshot() {
    return Object.freeze({ logs: Object.freeze([...this.logs].slice(-100)) });
  }
}

export class ClinicalAnalysisMetrics {
  private runs = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private lastDurationMs = 0;

  public recordRun(durationMs: number): void {
    this.runs += 1;
    this.lastDurationMs = durationMs;
  }

  public recordCacheHit(): void {
    this.cacheHits += 1;
  }

  public recordCacheMiss(): void {
    this.cacheMisses += 1;
  }

  public snapshot() {
    return Object.freeze({
      runs: this.runs,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      lastDurationMs: this.lastDurationMs
    });
  }
}
