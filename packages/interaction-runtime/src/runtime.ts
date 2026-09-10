import type { ViewportId } from '@cad-studio/viewport-runtime';
import type { InteractionConfiguration } from './configuration.js';
import { InteractionRegistry } from './registry.js';
import { InteractionSession, type InteractionSessionOptions } from './session.js';
import {
  asInteractionRuntimeId,
  asInteractionSessionId,
  createDefaultInteractionClock,
  type InteractionClock,
  type InteractionRuntimeId,
  type InteractionSessionId,
  interactionFailure,
  interactionSuccess,
  type InteractionResult
} from './types.js';

export interface InteractionRuntimeOptions {
  readonly id?: InteractionRuntimeId;
  readonly clock?: InteractionClock;
  readonly registry?: InteractionRegistry;
  readonly defaultConfiguration?: Partial<InteractionConfiguration>;
}

let sessionSerial = 0;
let runtimeSerial = 0;

/**
 * Application-facing Interaction Runtime entry.
 * Converts raw platform input into immutable interaction events for tools.
 *
 * Ownership: caller owns the runtime; dispose releases all sessions.
 * Threading: single-owner; sessions must not be shared across threads.
 * Does not implement camera, selection, picking, or CAD manipulation.
 */
export class InteractionRuntime {
  public readonly id: InteractionRuntimeId;
  private readonly clock: InteractionClock;
  private readonly registry: InteractionRegistry;
  private readonly defaultConfiguration: Partial<InteractionConfiguration>;
  private disposed = false;

  public constructor(options: InteractionRuntimeOptions = {}) {
    runtimeSerial += 1;
    this.id = options.id ?? asInteractionRuntimeId(`interaction-${String(runtimeSerial)}`);
    this.clock = options.clock ?? createDefaultInteractionClock();
    this.registry = options.registry ?? new InteractionRegistry();
    this.defaultConfiguration = options.defaultConfiguration ?? {};
  }

  public getRegistry(): InteractionRegistry {
    return this.registry;
  }

  public createSessionId(prefix = 'interaction-session'): InteractionSessionId {
    sessionSerial += 1;
    return asInteractionSessionId(`${prefix}-${String(sessionSerial)}`);
  }

  public createSession(
    options: {
      readonly sessionId?: InteractionSessionId;
      readonly viewportId?: ViewportId;
      readonly configuration?: Partial<InteractionConfiguration>;
    } = {}
  ): InteractionResult<InteractionSession> {
    if (this.disposed) {
      return interactionFailure('unavailable', 'InteractionRuntime disposed');
    }
    const sessionOptions: InteractionSessionOptions = {
      sessionId: options.sessionId ?? this.createSessionId(),
      configuration: {
        ...this.defaultConfiguration,
        ...(options.configuration ?? {})
      },
      clock: this.clock,
      ...(options.viewportId === undefined ? {} : { viewportId: options.viewportId })
    };
    const session = new InteractionSession(sessionOptions);
    const registered = this.registry.register(session);
    if (!registered.ok) {
      session.dispose();
      return registered;
    }
    return interactionSuccess(session);
  }

  /**
   * Create, initialize, and activate a session ready for input.
   */
  public bootstrapSession(
    options: {
      readonly sessionId?: InteractionSessionId;
      readonly viewportId?: ViewportId;
      readonly configuration?: Partial<InteractionConfiguration>;
      readonly signal?: AbortSignal;
    } = {}
  ): InteractionResult<InteractionSession> {
    const created = this.createSession(options);
    if (!created.ok) {
      return created;
    }
    const init = created.value.initialize(options.signal);
    if (!init.ok) {
      created.value.dispose();
      this.registry.unregister(created.value.sessionId);
      return init;
    }
    const active = created.value.activate();
    if (!active.ok) {
      created.value.dispose();
      this.registry.unregister(created.value.sessionId);
      return active;
    }
    return created;
  }

  public getSession(sessionId: InteractionSessionId): InteractionSession | undefined {
    return this.registry.get(sessionId);
  }

  public getSessionForViewport(viewportId: ViewportId): InteractionSession | undefined {
    return this.registry.getByViewport(viewportId);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.registry.clear();
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
