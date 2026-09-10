import type { FrameCoordinator } from './frame-coordinator.js';
import type { FrameScheduler } from './frame-scheduler.js';
import type { PresentationScheduler } from './presentation-scheduler.js';
import type { FrameInvalidation } from './frame-invalidation.js';
import { viewportFailure, viewportSuccess, type ViewportResult } from './types.js';

/**
 * Binds FrameScheduler ticks to FrameCoordinator execution.
 * Ownership: session-owned.
 */
export class RenderLoop {
  private active = false;
  private lastError: string | undefined;

  public constructor(
    private readonly scheduler: FrameScheduler,
    private readonly coordinator: FrameCoordinator,
    private readonly presentation: PresentationScheduler,
    private readonly invalidation: FrameInvalidation
  ) {}

  public start(): ViewportResult<void> {
    if (this.active) {
      return viewportFailure('conflict', 'Render loop already active');
    }
    this.active = true;
    this.scheduler.start((_timeMs) => {
      const result = this.coordinator.runFrame();
      if (!result.ok) {
        this.lastError = result.error.message;
      }
    });
    return viewportSuccess(undefined);
  }

  public stop(): void {
    this.active = false;
    this.scheduler.stop();
  }

  public isActive(): boolean {
    return this.active;
  }

  public invalidate(reason = 'manual'): void {
    this.invalidation.invalidate(reason);
    this.presentation.requestPresent();
    this.scheduler.requestFrame();
  }

  public pump(): ViewportResult<import('./frame-coordinator.js').FrameResult> {
    this.presentation.requestPresent();
    return this.coordinator.runFrame();
  }

  public getLastError(): string | undefined {
    return this.lastError;
  }
}
