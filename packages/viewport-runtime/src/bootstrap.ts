import type { ViewportLifecycle } from './lifecycle.js';
import type { ViewportEvents } from './events.js';
import type { FrameClock } from './types.js';
import { viewportFailure, viewportSuccess, type ViewportResult } from './types.js';

/**
 * Deterministic bootstrap sequence helper (Create → Initialize → Configure path).
 */
export class ViewportBootstrap {
  public constructor(
    private readonly lifecycle: ViewportLifecycle,
    private readonly events: ViewportEvents,
    private readonly clock: FrameClock
  ) {}

  public beginInitialize(): ViewportResult<void> {
    if (!this.lifecycle.transition('initializing')) {
      return viewportFailure(
        'lifecycle',
        `Cannot initialize from phase ${this.lifecycle.getPhase()}`
      );
    }
    this.emit();
    if (!this.lifecycle.transition('initialized')) {
      return viewportFailure('lifecycle', 'Failed to reach initialized');
    }
    this.emit();
    return viewportSuccess(undefined);
  }

  public beginConfigure(): ViewportResult<void> {
    if (!this.lifecycle.transition('configuring')) {
      return viewportFailure(
        'lifecycle',
        `Cannot configure from phase ${this.lifecycle.getPhase()}`
      );
    }
    this.emit();
    return viewportSuccess(undefined);
  }

  public finishConfigure(): ViewportResult<void> {
    if (!this.lifecycle.transition('configured')) {
      return viewportFailure('lifecycle', 'Failed to reach configured');
    }
    this.emit();
    return viewportSuccess(undefined);
  }

  public beginAttach(): ViewportResult<void> {
    if (!this.lifecycle.transition('attaching')) {
      return viewportFailure(
        'lifecycle',
        `Cannot attach from phase ${this.lifecycle.getPhase()}`
      );
    }
    this.emit();
    return viewportSuccess(undefined);
  }

  public finishAttach(): ViewportResult<void> {
    if (!this.lifecycle.transition('attached')) {
      return viewportFailure('lifecycle', 'Failed to reach attached');
    }
    this.emit();
    return viewportSuccess(undefined);
  }

  public markSessionReady(): ViewportResult<void> {
    if (!this.lifecycle.transition('session-ready')) {
      return viewportFailure('lifecycle', 'Failed to reach session-ready');
    }
    this.emit();
    return viewportSuccess(undefined);
  }

  private emit(): void {
    this.events.emit({
      type: 'lifecycle',
      phase: this.lifecycle.getPhase(),
      at: this.clock.now()
    });
  }
}
