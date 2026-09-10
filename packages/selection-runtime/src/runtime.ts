import type { InteractionSessionId } from '@cad-studio/interaction-runtime';
import type { SelectionConfiguration } from './configuration.js';
import { SelectionRegistry } from './registry.js';
import { SelectionSession, type SelectionSessionOptions } from './session.js';
import {
  asSelectionRuntimeId,
  asSelectionSessionId,
  createDefaultSelectionClock,
  type SelectionClock,
  type SelectionRuntimeId,
  type SelectionSessionId,
  selectionFailure,
  selectionSuccess,
  type SelectionResult
} from './types.js';

export interface SelectionRuntimeOptions {
  readonly id?: SelectionRuntimeId;
  readonly clock?: SelectionClock;
  readonly registry?: SelectionRegistry;
  readonly defaultConfiguration?: Partial<SelectionConfiguration>;
}

let sessionSerial = 0;
let runtimeSerial = 0;

/**
 * Application-facing Selection Runtime entry.
 * Owns immutable selection state and lifecycle. No hit testing or geometry.
 *
 * Ownership: caller owns the runtime; dispose releases all sessions.
 * Threading: single-owner; sessions must not be shared across threads.
 */
export class SelectionRuntime {
  public readonly id: SelectionRuntimeId;
  private readonly clock: SelectionClock;
  private readonly registry: SelectionRegistry;
  private readonly defaultConfiguration: Partial<SelectionConfiguration>;
  private disposed = false;

  public constructor(options: SelectionRuntimeOptions = {}) {
    runtimeSerial += 1;
    this.id = options.id ?? asSelectionRuntimeId(`selection-${String(runtimeSerial)}`);
    this.clock = options.clock ?? createDefaultSelectionClock();
    this.registry = options.registry ?? new SelectionRegistry();
    this.defaultConfiguration = options.defaultConfiguration ?? {};
  }

  public getRegistry(): SelectionRegistry {
    return this.registry;
  }

  public createSessionId(prefix = 'selection-session'): SelectionSessionId {
    sessionSerial += 1;
    return asSelectionSessionId(`${prefix}-${String(sessionSerial)}`);
  }

  public createSession(
    options: {
      readonly sessionId?: SelectionSessionId;
      readonly interactionSessionId?: InteractionSessionId;
      readonly configuration?: Partial<SelectionConfiguration>;
    } = {}
  ): SelectionResult<SelectionSession> {
    if (this.disposed) {
      return selectionFailure('unavailable', 'SelectionRuntime disposed');
    }
    const sessionOptions: SelectionSessionOptions = {
      sessionId: options.sessionId ?? this.createSessionId(),
      configuration: {
        ...this.defaultConfiguration,
        ...(options.configuration ?? {})
      },
      clock: this.clock,
      ...(options.interactionSessionId === undefined
        ? {}
        : { interactionSessionId: options.interactionSessionId })
    };
    const session = new SelectionSession(sessionOptions);
    const registered = this.registry.register(session);
    if (!registered.ok) {
      session.dispose();
      return registered;
    }
    return selectionSuccess(session);
  }

  /** Create + begin (ready for selection). */
  public bootstrapSession(
    options: {
      readonly sessionId?: SelectionSessionId;
      readonly interactionSessionId?: InteractionSessionId;
      readonly configuration?: Partial<SelectionConfiguration>;
      readonly signal?: AbortSignal;
    } = {}
  ): SelectionResult<SelectionSession> {
    const created = this.createSession(options);
    if (!created.ok) {
      return created;
    }
    const began = created.value.begin(options.signal);
    if (!began.ok) {
      created.value.dispose();
      this.registry.unregister(created.value.sessionId);
      return began;
    }
    return created;
  }

  public getSession(sessionId: SelectionSessionId): SelectionSession | undefined {
    return this.registry.get(sessionId);
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
