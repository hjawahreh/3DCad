/**
 * Clinical import diagnostics + metrics + notifications + recent imports.
 */

export type ClinicalImportPhase =
  | 'idle'
  | 'selecting'
  | 'validating'
  | 'resolving'
  | 'importing'
  | 'building-document'
  | 'populating-scene'
  | 'refreshing-viewport'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface ClinicalImportProgress {
  readonly phase: ClinicalImportPhase;
  readonly ratio: number;
  readonly message: string;
  readonly updatedAt: number;
}

export interface RecentImportEntry {
  readonly fileName: string;
  readonly format: string;
  readonly importedAt: number;
  readonly objectCount: number;
  readonly success: boolean;
}

export class ClinicalImportDiagnostics {
  private readonly logs: Array<{
    readonly id: string;
    readonly severity: 'info' | 'warning' | 'error';
    readonly message: string;
    readonly at: number;
  }> = [];
  private serial = 0;
  private validationFailures = 0;
  private cancelledImports = 0;
  private sceneFailures = 0;
  private documentFailures = 0;
  private lastImporterId: string | undefined;
  private lastDurationMs = 0;

  public record(
    severity: 'info' | 'warning' | 'error',
    message: string,
    at = Date.now()
  ): void {
    this.serial += 1;
    this.logs.push(
      Object.freeze({
        id: `imp-diag-${String(this.serial)}`,
        severity,
        message,
        at
      })
    );
    if (this.logs.length > 300) {
      this.logs.shift();
    }
  }

  public recordValidationFailure(message: string): void {
    this.validationFailures += 1;
    this.record('warning', message);
  }

  public recordCancelled(message: string): void {
    this.cancelledImports += 1;
    this.record('info', message);
  }

  public recordSceneFailure(message: string): void {
    this.sceneFailures += 1;
    this.record('error', message);
  }

  public recordDocumentFailure(message: string): void {
    this.documentFailures += 1;
    this.record('error', message);
  }

  public recordImporter(importerId: string, durationMs: number): void {
    this.lastImporterId = importerId;
    this.lastDurationMs = durationMs;
  }

  public snapshot() {
    return Object.freeze({
      logs: Object.freeze([...this.logs]),
      validationFailures: this.validationFailures,
      cancelledImports: this.cancelledImports,
      sceneFailures: this.sceneFailures,
      documentFailures: this.documentFailures,
      lastImporterId: this.lastImporterId,
      lastDurationMs: this.lastDurationMs
    });
  }
}

export class ClinicalImportMetrics {
  private importCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private totalDurationMs = 0;
  private largestVertexCount = 0;
  private largestFaceCount = 0;
  private activeDocumentCount = 0;

  public recordAttempt(): void {
    this.importCount += 1;
  }

  public recordSuccess(durationMs: number, vertexCount?: number, faceCount?: number): void {
    this.successCount += 1;
    this.totalDurationMs += durationMs;
    if (vertexCount !== undefined && vertexCount > this.largestVertexCount) {
      this.largestVertexCount = vertexCount;
    }
    if (faceCount !== undefined && faceCount > this.largestFaceCount) {
      this.largestFaceCount = faceCount;
    }
  }

  public recordFailure(durationMs: number): void {
    this.failureCount += 1;
    this.totalDurationMs += durationMs;
  }

  public setActiveDocumentCount(count: number): void {
    this.activeDocumentCount = count;
  }

  public snapshot() {
    const completed = this.successCount + this.failureCount;
    return Object.freeze({
      importCount: this.importCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      averageDurationMs: completed === 0 ? 0 : this.totalDurationMs / completed,
      largestVertexCount: this.largestVertexCount,
      largestFaceCount: this.largestFaceCount,
      activeDocumentCount: this.activeDocumentCount
    });
  }
}

export class ClinicalImportNotifications {
  private progress: ClinicalImportProgress = Object.freeze({
    phase: 'idle',
    ratio: 0,
    message: '',
    updatedAt: 0
  });
  private readonly recent: RecentImportEntry[] = [];
  private readonly listeners = new Set<() => void>();

  public getProgress(): ClinicalImportProgress {
    return this.progress;
  }

  public setProgress(partial: Partial<ClinicalImportProgress> & { readonly phase: ClinicalImportPhase }): void {
    this.progress = Object.freeze({
      phase: partial.phase,
      ratio: partial.ratio ?? this.progress.ratio,
      message: partial.message ?? this.progress.message,
      updatedAt: partial.updatedAt ?? Date.now()
    });
    this.emit();
  }

  public addRecent(entry: RecentImportEntry): void {
    this.recent.unshift(Object.freeze(entry));
    if (this.recent.length > 20) {
      this.recent.pop();
    }
    this.emit();
  }

  public listRecent(): readonly RecentImportEntry[] {
    return Object.freeze([...this.recent]);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
