import type { ViewportDiagnostics } from './diagnostics.js';
import type { ViewportEvents } from './events.js';
import type { ViewportError } from './types.js';

/**
 * Captures runtime failures without throwing across the frame boundary.
 */
export class ErrorBoundary {
  private lastError: ViewportError | undefined;

  public constructor(
    private readonly diagnostics: ViewportDiagnostics,
    private readonly events: ViewportEvents
  ) {}

  public capture(error: ViewportError, at: number): void {
    this.lastError = error;
    this.diagnostics.error(error.code, error.message, at);
    this.events.emit({
      type: 'error',
      code: error.code,
      message: error.message,
      at
    });
  }

  public last(): ViewportError | undefined {
    return this.lastError;
  }

  public clear(): void {
    this.lastError = undefined;
  }
}

export type RecoveryAction = 'none' | 'invalidate' | 'recreate-renderer' | 'shutdown';

/**
 * Maps captured errors to recovery actions (contracts only — no CAD retries).
 */
export class RecoveryCoordinator {
  public decide(error: ViewportError): RecoveryAction {
    switch (error.code) {
      case 'context-lost':
        return 'recreate-renderer';
      case 'backend':
        return 'invalidate';
      case 'unavailable':
      case 'lifecycle':
        return 'shutdown';
      case 'cancelled':
        return 'none';
      default:
        return 'invalidate';
    }
  }
}
