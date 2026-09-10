import type { ViewportConfiguration } from './configuration.js';
import { ViewportRegistry } from './host.js';
import { ViewportSession, type ViewportSessionOptions } from './session.js';
import {
  asViewportId,
  asViewportSessionId,
  createDefaultFrameClock,
  type FrameClock,
  type ViewportId,
  type ViewportSessionId,
  viewportFailure,
  viewportSuccess,
  type ViewportResult
} from './types.js';

export interface ViewportRuntimeOptions {
  readonly clock?: FrameClock;
  readonly registry?: ViewportRegistry;
  readonly defaultConfiguration?: Partial<ViewportConfiguration>;
  readonly forceMockBackend?: boolean;
}

let sessionSerial = 0;
let viewportSerial = 0;

/**
 * Application-facing Viewport Runtime entry.
 * Orchestrates Graphics Engine + Scene snapshots; never owns CAD logic or Three.js objects.
 *
 * Ownership: caller owns the runtime; dispose releases all sessions.
 * Threading: single-owner; sessions must not be shared across threads.
 * Failure modes: lifecycle, backend, cancelled, conflict, unavailable.
 */
export class ViewportRuntime {
  private readonly clock: FrameClock;
  private readonly registry: ViewportRegistry;
  private readonly defaultConfiguration: Partial<ViewportConfiguration>;
  private readonly forceMockBackend: boolean;
  private disposed = false;

  public constructor(options: ViewportRuntimeOptions = {}) {
    this.clock = options.clock ?? createDefaultFrameClock();
    this.registry = options.registry ?? new ViewportRegistry();
    this.defaultConfiguration = options.defaultConfiguration ?? {};
    this.forceMockBackend = options.forceMockBackend === true;
  }

  public getRegistry(): ViewportRegistry {
    return this.registry;
  }

  public createViewportId(prefix = 'viewport'): ViewportId {
    viewportSerial += 1;
    return asViewportId(`${prefix}-${String(viewportSerial)}`);
  }

  public createSessionId(prefix = 'session'): ViewportSessionId {
    sessionSerial += 1;
    return asViewportSessionId(`${prefix}-${String(sessionSerial)}`);
  }

  /**
   * Create a session in phase `created` (not yet initialized).
   */
  public createSession(
    options: {
      readonly viewportId?: ViewportId;
      readonly sessionId?: ViewportSessionId;
      readonly configuration?: Partial<ViewportConfiguration>;
    } = {}
  ): ViewportResult<ViewportSession> {
    if (this.disposed) {
      return viewportFailure('unavailable', 'ViewportRuntime disposed');
    }
    const viewportId = options.viewportId ?? this.createViewportId();
    const existing = this.registry.get(viewportId)?.getSession();
    if (existing !== undefined) {
      return viewportFailure('conflict', `Viewport ${viewportId} already has a session`);
    }

    const sessionOptions: ViewportSessionOptions = {
      viewportId,
      sessionId: options.sessionId ?? this.createSessionId(),
      configuration: {
        ...this.defaultConfiguration,
        ...(options.configuration ?? {})
      },
      clock: this.clock,
      ...(this.forceMockBackend ? { forceMockBackend: true } : {})
    };
    const session = new ViewportSession(sessionOptions);
    const registered = this.registry.registerSession(session);
    if (!registered.ok) {
      session.dispose();
      return registered;
    }
    return viewportSuccess(session);
  }

  public getSession(viewportId: ViewportId): ViewportSession | undefined {
    return this.registry.get(viewportId)?.getSession();
  }

  public async bootstrapSession(
    session: ViewportSession,
    canvas: import('./types.js').ViewportCanvasElement,
    signal?: AbortSignal
  ): Promise<ViewportResult<ViewportSession>> {
    const init = await session.initialize(signal);
    if (!init.ok) {
      return init;
    }
    const configured = session.configure();
    if (!configured.ok) {
      return configured;
    }
    const attached = await session.attachCanvas(canvas, signal);
    if (!attached.ok) {
      return attached;
    }
    return viewportSuccess(session);
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
