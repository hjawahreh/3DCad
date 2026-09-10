import type { InteractionEvent } from './events.js';
import type { InteractionEvents } from './events.js';
import type { InteractionDiagnostics } from './diagnostics.js';
import type { InteractionMetrics } from './metrics.js';
import type { InteractionClock } from './types.js';

/**
 * Deterministic ordered dispatch of immutable interaction events.
 * Ownership: session-owned.
 * Threading: single-owner; no concurrent emit.
 */
export class EventDispatcher {
  private sequence = 0;
  private queueDepth = 0;

  public constructor(
    private readonly bus: InteractionEvents,
    private readonly metrics: InteractionMetrics,
    private readonly diagnostics: InteractionDiagnostics,
    private readonly clock: InteractionClock
  ) {}

  public nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  public getSequence(): number {
    return this.sequence;
  }

  public setQueueDepth(depth: number): void {
    this.queueDepth = depth;
    this.diagnostics.setQueueDepth(depth);
  }

  public getQueueDepth(): number {
    return this.queueDepth;
  }

  public dispatch(event: InteractionEvent, platformTimestamp: number): void {
    const started = this.clock.now();
    this.bus.emit(event);
    const ended = this.clock.now();
    const dispatchLatencyMs = ended - started;
    const inputLatencyMs = Math.max(0, started - platformTimestamp);
    this.diagnostics.recordEvent(event.kind);
    this.diagnostics.setDispatchTiming(dispatchLatencyMs);
    this.metrics.recordDispatch({
      kind: event.kind,
      inputLatencyMs,
      dispatchLatencyMs
    });
  }
}
