import type { InteractionSessionId } from '@cad-studio/interaction-runtime';
import type { ViewportId } from '@cad-studio/viewport-runtime';
import type { CameraConfiguration } from './configuration.js';
import { CameraRegistry } from './registry.js';
import { CameraSession, type CameraSessionOptions } from './session.js';
import {
  asCameraRuntimeId,
  asCameraSessionId,
  createDefaultCameraClock,
  type CameraClock,
  type CameraRuntimeId,
  type CameraSessionId,
  type Size2D,
  cameraFailure,
  cameraSuccess,
  type CameraResult
} from './types.js';

export interface CameraRuntimeOptions {
  readonly id?: CameraRuntimeId;
  readonly clock?: CameraClock;
  readonly registry?: CameraRegistry;
  readonly defaultConfiguration?: Partial<CameraConfiguration>;
}

let sessionSerial = 0;
let runtimeSerial = 0;

/**
 * Application-facing Camera Runtime entry.
 * Owns camera state, projection, navigation orchestration, and viewport sync.
 *
 * Ownership: caller owns the runtime; dispose releases all sessions.
 * Threading: single-owner; sessions must not be shared across threads.
 * Does not render, select, pick, or mutate Scene / Graphics Engine state.
 */
export class CameraRuntime {
  public readonly id: CameraRuntimeId;
  private readonly clock: CameraClock;
  private readonly registry: CameraRegistry;
  private readonly defaultConfiguration: Partial<CameraConfiguration>;
  private disposed = false;

  public constructor(options: CameraRuntimeOptions = {}) {
    runtimeSerial += 1;
    this.id = options.id ?? asCameraRuntimeId(`camera-${String(runtimeSerial)}`);
    this.clock = options.clock ?? createDefaultCameraClock();
    this.registry = options.registry ?? new CameraRegistry();
    this.defaultConfiguration = options.defaultConfiguration ?? {};
  }

  public getRegistry(): CameraRegistry {
    return this.registry;
  }

  public createSessionId(prefix = 'camera-session'): CameraSessionId {
    sessionSerial += 1;
    return asCameraSessionId(`${prefix}-${String(sessionSerial)}`);
  }

  public createSession(
    options: {
      readonly sessionId?: CameraSessionId;
      readonly viewportId?: ViewportId;
      readonly interactionSessionId?: InteractionSessionId;
      readonly configuration?: Partial<CameraConfiguration>;
    } = {}
  ): CameraResult<CameraSession> {
    if (this.disposed) {
      return cameraFailure('unavailable', 'CameraRuntime disposed');
    }
    const sessionOptions: CameraSessionOptions = {
      sessionId: options.sessionId ?? this.createSessionId(),
      configuration: {
        ...this.defaultConfiguration,
        ...(options.configuration ?? {})
      },
      clock: this.clock,
      ...(options.viewportId === undefined ? {} : { viewportId: options.viewportId }),
      ...(options.interactionSessionId === undefined
        ? {}
        : { interactionSessionId: options.interactionSessionId })
    };
    const session = new CameraSession(sessionOptions);
    const registered = this.registry.register(session);
    if (!registered.ok) {
      session.dispose();
      return registered;
    }
    return cameraSuccess(session);
  }

  /**
   * Create → initialize → configure → attach viewport → ready.
   */
  public bootstrapSession(
    options: {
      readonly sessionId?: CameraSessionId;
      readonly viewportId?: ViewportId;
      readonly interactionSessionId?: InteractionSessionId;
      readonly configuration?: Partial<CameraConfiguration>;
      readonly viewportSize?: Size2D;
      readonly signal?: AbortSignal;
    } = {}
  ): CameraResult<CameraSession> {
    const created = this.createSession(options);
    if (!created.ok) {
      return created;
    }
    const session = created.value;
    const init = session.initialize(options.signal);
    if (!init.ok) {
      this.failBootstrap(session);
      return init;
    }
    const configured = session.configure();
    if (!configured.ok) {
      this.failBootstrap(session);
      return configured;
    }
    const attached = session.attachViewport(options.viewportSize);
    if (!attached.ok) {
      this.failBootstrap(session);
      return attached;
    }
    return cameraSuccess(session);
  }

  public getSession(sessionId: CameraSessionId): CameraSession | undefined {
    return this.registry.get(sessionId);
  }

  public getSessionForViewport(viewportId: ViewportId): CameraSession | undefined {
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

  private failBootstrap(session: CameraSession): void {
    session.dispose();
    this.registry.unregister(session.sessionId);
  }
}
