import { importFailure, importSuccess, type ImportResultType } from './types.js';

/**
 * Cancellation token wrapper for an import session.
 * Ownership: session-owned; abort is idempotent.
 */
export class ImportCancellation {
  private readonly controller: AbortController;
  private cancelled = false;
  private reason: string | undefined;

  public constructor(external?: AbortSignal) {
    this.controller = new AbortController();
    if (external !== undefined) {
      if (external.aborted) {
        this.cancel('external-abort');
      } else {
        external.addEventListener(
          'abort',
          () => {
            this.cancel('external-abort');
          },
          { once: true }
        );
      }
    }
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public isCancelled(): boolean {
    return this.cancelled || this.controller.signal.aborted;
  }

  public getReason(): string | undefined {
    return this.reason;
  }

  public cancel(reason = 'user-cancel'): ImportResultType<void> {
    if (this.cancelled) {
      return importSuccess(undefined);
    }
    this.cancelled = true;
    this.reason = reason;
    this.controller.abort();
    return importSuccess(undefined);
  }

  public throwIfCancelled(): ImportResultType<void> {
    if (this.isCancelled()) {
      return importFailure('cancelled', this.reason ?? 'Import cancelled');
    }
    return importSuccess(undefined);
  }
}
