import type { ProjectEvents } from './events.js';
import type { ProjectClock, ProjectScheduler } from './types.js';
import { projectFailure, projectSuccess, type ProjectResult } from './types.js';

export interface AutosaveRecoveryMetadata {
  readonly lastAutosaveAt: number | undefined;
  readonly lastAutosaveRevision: number | undefined;
  readonly suppressedCount: number;
  readonly failureCount: number;
  readonly successCount: number;
}

/**
 * Schedules autosave callbacks when dirty. Does not serialize files —
 * host performs persistence via save contracts.
 */
export class AutosaveCoordinator {
  private handle: number | undefined;
  private suppressed = false;
  private lastAutosaveAt: number | undefined;
  private lastAutosaveRevision: number | undefined;
  private suppressedCount = 0;
  private failureCount = 0;
  private successCount = 0;
  private onAutosave: (() => ProjectResult<void>) | undefined;

  public constructor(
    private readonly clock: ProjectClock,
    private readonly scheduler: ProjectScheduler,
    private readonly events: ProjectEvents,
    private readonly intervalMs: number,
    private readonly enabled: boolean
  ) {}

  public setHandler(handler: () => ProjectResult<void>): void {
    this.onAutosave = handler;
  }

  public isEnabled(): boolean {
    return this.enabled && !this.suppressed;
  }

  public suppress(): void {
    this.suppressed = true;
    this.suppressedCount += 1;
    this.cancelScheduled();
    this.events.emit({
      type: 'autosave',
      phase: 'suppressed',
      at: this.clock.now()
    });
  }

  public resume(): void {
    this.suppressed = false;
  }

  public scheduleIfNeeded(dirty: boolean): void {
    if (!this.enabled || this.suppressed || !dirty) {
      return;
    }
    if (this.handle !== undefined) {
      return;
    }
    this.events.emit({
      type: 'autosave',
      phase: 'scheduled',
      at: this.clock.now()
    });
    this.handle = this.scheduler.schedule(() => {
      this.handle = undefined;
      this.run();
    }, this.intervalMs);
  }

  public cancelScheduled(): void {
    if (this.handle === undefined) {
      return;
    }
    this.scheduler.cancel(this.handle);
    this.handle = undefined;
  }

  public runNow(documentRevision: number): ProjectResult<void> {
    return this.run(documentRevision);
  }

  public recoveryMetadata(): AutosaveRecoveryMetadata {
    return Object.freeze({
      lastAutosaveAt: this.lastAutosaveAt,
      lastAutosaveRevision: this.lastAutosaveRevision,
      suppressedCount: this.suppressedCount,
      failureCount: this.failureCount,
      successCount: this.successCount
    });
  }

  public dispose(): void {
    this.cancelScheduled();
    this.onAutosave = undefined;
  }

  private run(documentRevision?: number): ProjectResult<void> {
    if (!this.enabled || this.suppressed) {
      this.suppressedCount += 1;
      this.events.emit({
        type: 'autosave',
        phase: 'suppressed',
        at: this.clock.now()
      });
      return projectSuccess(undefined);
    }
    if (this.onAutosave === undefined) {
      return projectFailure('autosave', 'No autosave handler registered');
    }
    this.events.emit({
      type: 'autosave',
      phase: 'started',
      at: this.clock.now()
    });
    const result = this.onAutosave();
    if (!result.ok) {
      this.failureCount += 1;
      this.events.emit({
        type: 'autosave',
        phase: 'failed',
        message: result.error.message,
        at: this.clock.now()
      });
      return result;
    }
    this.successCount += 1;
    this.lastAutosaveAt = this.clock.now();
    if (documentRevision !== undefined) {
      this.lastAutosaveRevision = documentRevision;
    }
    this.events.emit({
      type: 'autosave',
      phase: 'completed',
      at: this.clock.now()
    });
    return projectSuccess(undefined);
  }
}
