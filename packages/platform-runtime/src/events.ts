import type { Clock, CorrelationId } from './contracts.js';
import { success, type Result, type RuntimeError } from './result.js';

export type EventStream =
  'domain' | 'application' | 'platform' | 'workflow' | 'tool' | 'rendering' | 'telemetry';

export interface EventEnvelope<TName extends string = string, TPayload = unknown> {
  readonly id: string;
  readonly name: TName;
  readonly stream: EventStream;
  readonly payload: Readonly<TPayload>;
  readonly correlationId: CorrelationId;
  readonly causationId?: string;
  readonly timestamp: number;
}

export interface EventSubscription {
  readonly stream?: EventStream;
  readonly name?: string;
  readonly priority?: number;
  readonly replay?: boolean;
  readonly filter?: (event: EventEnvelope) => boolean;
}

export type EventHandler = (
  event: EventEnvelope
) => Promise<Result<void, RuntimeError>> | Result<void, RuntimeError>;

interface HandlerRecord {
  readonly subscription: EventSubscription;
  readonly handler: EventHandler;
  readonly order: number;
}

export class EventBus {
  private readonly handlers: HandlerRecord[] = [];
  private readonly replay: EventEnvelope[] = [];
  private order = 0;

  public constructor(
    private readonly clock: Clock,
    private readonly replayLimit = 256
  ) {}

  public subscribe(subscription: EventSubscription, handler: EventHandler): () => void {
    const record = { subscription, handler, order: this.order++ };
    this.handlers.push(record);
    if (subscription.replay) void this.deliverReplay(record);
    return () => {
      const index = this.handlers.indexOf(record);
      if (index >= 0) this.handlers.splice(index, 1);
    };
  }

  public async publish(
    event: Omit<EventEnvelope, 'timestamp'>
  ): Promise<Result<void, RuntimeError>> {
    const envelope = Object.freeze({
      ...event,
      payload: Object.freeze(event.payload),
      timestamp: this.clock.now()
    });
    this.replay.push(envelope);
    if (this.replay.length > this.replayLimit) this.replay.shift();
    const records = this.matching(envelope);
    for (const record of records) {
      const result = await record.handler(envelope);
      if (!result.ok) return result;
    }
    return success(undefined);
  }

  private async deliverReplay(record: HandlerRecord): Promise<void> {
    for (const event of this.replay.filter((candidate) =>
      this.matches(record.subscription, candidate)
    )) {
      const result = await record.handler(event);
      if (!result.ok) break;
    }
  }

  private matching(event: EventEnvelope): HandlerRecord[] {
    return this.handlers
      .filter((record) => this.matches(record.subscription, event))
      .sort(
        (a, b) =>
          (b.subscription.priority ?? 0) - (a.subscription.priority ?? 0) || a.order - b.order
      );
  }

  private matches(subscription: EventSubscription, event: EventEnvelope): boolean {
    return (
      (subscription.stream === undefined || subscription.stream === event.stream) &&
      (subscription.name === undefined || subscription.name === event.name) &&
      (subscription.filter?.(event) ?? true)
    );
  }
}
