/**
 * ClinicalImportSession — one in-flight clinical import against Import Runtime.
 */

import type { ImportRequest, ImportSession } from '@cad-studio/import-runtime';
import { ClinicalImportWorkflow } from './ClinicalImportWorkflow.js';
import type { ClinicalImportProgress } from './ClinicalImportObservability.js';

export class ClinicalImportSession {
  public readonly workflow = new ClinicalImportWorkflow();
  private importSession: ImportSession | undefined;
  private request: ImportRequest | undefined;
  private controller: AbortController | undefined;
  private unsub: (() => void) | undefined;

  public getRequest(): ImportRequest | undefined {
    return this.request;
  }

  public getImportSession(): ImportSession | undefined {
    return this.importSession;
  }

  public getAbortSignal(): AbortSignal | undefined {
    return this.controller?.signal;
  }

  public begin(request: ImportRequest, importSession: ImportSession): void {
    this.disposeListeners();
    this.request = request;
    this.importSession = importSession;
    this.controller = new AbortController();
    this.workflow.reset();
    this.workflow.advance('selecting');
  }

  public subscribeProgress(onProgress: (progress: ClinicalImportProgress) => void): void {
    const session = this.importSession;
    if (session === undefined) {
      return;
    }
    this.unsub = session.getEvents().subscribe((event) => {
      if (event.type !== 'progress') {
        return;
      }
      onProgress(
        Object.freeze({
          phase: 'importing',
          ratio: event.progress.ratio,
          message: event.progress.message ?? event.progress.stage,
          updatedAt: event.progress.updatedAt
        })
      );
    });
  }

  public cancel(reason = 'user-cancel'): void {
    this.controller?.abort();
    this.importSession?.cancel(reason);
    this.workflow.cancel();
  }

  public dispose(): void {
    this.disposeListeners();
    this.importSession = undefined;
    this.request = undefined;
    this.controller = undefined;
    this.workflow.reset();
  }

  private disposeListeners(): void {
    this.unsub?.();
    this.unsub = undefined;
  }
}
