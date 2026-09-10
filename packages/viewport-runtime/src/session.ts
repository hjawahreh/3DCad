import type { SceneSnapshot } from '@cad-studio/scene';
import { ViewportBootstrap } from './bootstrap.js';
import { CanvasHost } from './canvas-host.js';
import type { ViewportConfiguration } from './configuration.js';
import { resolveViewportConfiguration } from './configuration.js';
import type { ViewportContext } from './context.js';
import {
  BackendSelection,
  DeviceCapabilityRegistry
} from './device-capability.js';
import { ViewportDiagnostics } from './diagnostics.js';
import { ErrorBoundary, RecoveryCoordinator } from './error-boundary.js';
import { ViewportEvents } from './events.js';
import { FrameCoordinator } from './frame-coordinator.js';
import { FrameInvalidation } from './frame-invalidation.js';
import { FrameScheduler } from './frame-scheduler.js';
import { ViewportLifecycle } from './lifecycle.js';
import { ViewportMetrics } from './metrics.js';
import { OperationOverlayHost } from './operation-overlay-host.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { PresentationScheduler } from './presentation-scheduler.js';
import { RenderLoop } from './render-loop.js';
import { RenderSurface } from './render-surface.js';
import { RendererBridge } from './renderer-bridge.js';
import { ResourceLifecycle } from './resource-lifecycle.js';
import { ViewportResizeManager } from './resize-manager.js';
import { SceneBridge } from './scene-bridge.js';
import { ViewportShutdown } from './shutdown.js';
import { emptyViewportState, type ViewportState } from './state.js';
import {
  createDefaultFrameClock,
  type FrameClock,
  type Size2D,
  type ViewportCanvasElement,
  type ViewportId,
  type ViewportSessionId,
  viewportFailure,
  viewportSuccess,
  type ViewportResult
} from './types.js';

export interface ViewportSessionOptions {
  readonly viewportId: ViewportId;
  readonly sessionId: ViewportSessionId;
  readonly configuration?: Partial<ViewportConfiguration>;
  readonly clock?: FrameClock;
  readonly forceMockBackend?: boolean;
}

/**
 * One session per viewport.
 * Owns frame/runtime/canvas/presentation/backend state, metrics, and diagnostics.
 *
 * Threading: single-owner; do not call concurrently from multiple threads.
 * Cancellation: pass AbortSignal to createSession path / project consumers as needed.
 */
export class ViewportSession {
  public readonly viewportId: ViewportId;
  public readonly sessionId: ViewportSessionId;

  private readonly configuration: ViewportConfiguration;
  private readonly clock: FrameClock;
  private readonly forceMockBackend: boolean;

  private readonly lifecycle = new ViewportLifecycle();
  private readonly events = new ViewportEvents();
  private readonly metrics = new ViewportMetrics();
  private readonly diagnostics = new ViewportDiagnostics();
  private readonly canvasHost = new CanvasHost();
  private readonly resizeManager: ViewportResizeManager;
  private readonly invalidation: FrameInvalidation;
  private readonly scheduler: FrameScheduler;
  private readonly presentation = new PresentationScheduler();
  private readonly surface = new RenderSurface();
  private readonly sceneBridge = new SceneBridge();
  private readonly rendererBridge = new RendererBridge();
  private readonly resources = new ResourceLifecycle();
  private readonly overlays = new OperationOverlayHost();
  private readonly deviceCapabilities = new DeviceCapabilityRegistry();
  private readonly backendSelection = new BackendSelection();
  private readonly errorBoundary: ErrorBoundary;
  private readonly recovery = new RecoveryCoordinator();
  private readonly performance: PerformanceMonitor;
  private readonly coordinator: FrameCoordinator;
  private readonly renderLoop: RenderLoop;
  private readonly bootstrap: ViewportBootstrap;
  private readonly shutdownHelper: ViewportShutdown;

  private startedAt = 0;
  private signal: AbortSignal | undefined;

  public constructor(options: ViewportSessionOptions) {
    this.viewportId = options.viewportId;
    this.sessionId = options.sessionId;
    this.configuration = resolveViewportConfiguration(options.configuration);
    this.clock = options.clock ?? createDefaultFrameClock();
    this.forceMockBackend = options.forceMockBackend === true;

    this.canvasHost.configure({
      respectDevicePixelRatio: this.configuration.respectDevicePixelRatio
    });
    this.resizeManager = new ViewportResizeManager(this.canvasHost);
    this.invalidation = new FrameInvalidation(this.configuration.maxPendingInvalidations);
    this.scheduler = new FrameScheduler(
      this.clock,
      this.configuration.targetFps,
      this.configuration.idleFps
    );
    this.scheduler.setMode(this.configuration.renderMode);
    this.errorBoundary = new ErrorBoundary(this.diagnostics, this.events);
    this.performance = new PerformanceMonitor(
      this.configuration.targetFps,
      this.metrics,
      this.diagnostics
    );
    this.coordinator = new FrameCoordinator({
      clock: this.clock,
      resizeManager: this.resizeManager,
      invalidation: this.invalidation,
      sceneBridge: this.sceneBridge,
      rendererBridge: this.rendererBridge,
      presentation: this.presentation,
      surface: this.surface,
      canvasHost: this.canvasHost,
      metrics: this.metrics,
      diagnostics: this.diagnostics,
      performance: this.performance,
      events: this.events,
      errorBoundary: this.errorBoundary,
      recovery: this.recovery,
      targetFrameMs: 1000 / this.configuration.targetFps
    });
    this.renderLoop = new RenderLoop(
      this.scheduler,
      this.coordinator,
      this.presentation,
      this.invalidation
    );
    this.bootstrap = new ViewportBootstrap(this.lifecycle, this.events, this.clock);
    this.shutdownHelper = new ViewportShutdown(
      this.lifecycle,
      this.events,
      this.clock,
      this.renderLoop,
      this.rendererBridge,
      this.canvasHost,
      this.resources
    );

    this.resources.track({
      id: 'scheduler',
      kind: 'scheduler',
      dispose: () => this.scheduler.stop()
    });
  }

  public getLifecyclePhase(): string {
    return this.lifecycle.getPhase();
  }

  public getEvents(): ViewportEvents {
    return this.events;
  }

  public getMetrics(): ViewportMetrics {
    return this.metrics;
  }

  public getDiagnostics(): ViewportDiagnostics {
    return this.diagnostics;
  }

  public getOverlays(): OperationOverlayHost {
    return this.overlays;
  }

  public getSceneBridge(): SceneBridge {
    return this.sceneBridge;
  }

  public getRendererBridge(): RendererBridge {
    return this.rendererBridge;
  }

  public getCanvasHost(): CanvasHost {
    return this.canvasHost;
  }

  public getContext(): ViewportContext {
    return {
      viewportId: this.viewportId,
      sessionId: this.sessionId,
      configuration: this.configuration,
      clock: this.clock,
      events: this.events,
      signal: this.signal
    };
  }

  public getState(): ViewportState {
    const probe = this.deviceCapabilities.current();
    const backend = this.rendererBridge.getHost().backendKind();
    const base = emptyViewportState(this.lifecycle.getPhase());
    return Object.freeze({
      ...base,
      phase: this.lifecycle.getPhase(),
      presentation: Object.freeze({
        visible: this.canvasHost.isVisible(),
        fullscreen: this.canvasHost.isFullscreen(),
        contextLost: this.canvasHost.isContextLost(),
        devicePixelRatio: this.canvasHost.getDevicePixelInfo().devicePixelRatio,
        size: this.canvasHost.getSize()
      }),
      frame: Object.freeze({
        frameNumber: this.coordinator.getFrameNumber(),
        lastFrameMs: this.metrics.snapshot().frameTimeMs,
        pendingInvalidations: this.invalidation.isPending() ? 1 : 0,
        renderMode: this.scheduler.getMode()
      }),
      backend: Object.freeze({
        selected: backend,
        available: probe?.capabilities.availableBackends ?? [],
        deviceName: probe?.capabilities.deviceName ?? 'unknown',
        vendor: probe?.capabilities.vendor ?? 'unknown'
      }),
      sceneRevision: this.sceneBridge.sceneRevision(),
      documentRevision: this.sceneBridge.documentRevision()
    });
  }

  public async initialize(signal?: AbortSignal): Promise<ViewportResult<void>> {
    this.signal = signal;
    this.startedAt = this.clock.now();
    return this.bootstrap.beginInitialize();
  }

  public configure(
    partial?: Partial<ViewportConfiguration>
  ): ViewportResult<ViewportConfiguration> {
    const begin = this.bootstrap.beginConfigure();
    if (!begin.ok) {
      return begin;
    }
    // Configuration is resolved at construction; reconfigure updates scheduler knobs only.
    if (partial?.renderMode !== undefined) {
      this.scheduler.setMode(partial.renderMode);
    }
    if (partial?.targetFps !== undefined) {
      this.scheduler.setTargetFps(partial.targetFps);
    }
    if (partial?.idleFps !== undefined) {
      this.scheduler.setIdleFps(partial.idleFps);
    }
    const finish = this.bootstrap.finishConfigure();
    if (!finish.ok) {
      return finish;
    }
    return viewportSuccess(this.configuration);
  }

  public async attachCanvas(
    canvas: ViewportCanvasElement,
    signal?: AbortSignal
  ): Promise<ViewportResult<void>> {
    if (signal?.aborted === true) {
      return viewportFailure('cancelled', 'Attach cancelled');
    }
    const begin = this.bootstrap.beginAttach();
    if (!begin.ok) {
      return begin;
    }

    this.canvasHost.attach(canvas, {
      onResize: (info) => {
        this.resizeManager.requestResize({
          width: info.cssWidth,
          height: info.cssHeight
        });
        this.invalidate('canvas-resize');
      },
      onVisibility: (visible) => {
        if (!visible) {
          this.pause();
        }
      },
      onContext: (lost) => {
        this.events.emit({
          type: 'context',
          lost,
          at: this.clock.now()
        });
        if (lost) {
          this.diagnostics.recordContextLoss();
          this.errorBoundary.capture(
            { code: 'context-lost', message: 'WebGL context lost' },
            this.clock.now()
          );
        } else {
          this.invalidate('context-restored');
        }
      }
    });

    const info = this.canvasHost.syncFromCanvas();
    this.surface.set(
      { width: info.bufferWidth, height: info.bufferHeight },
      info.devicePixelRatio
    );

    const probe = this.deviceCapabilities.probe({
      canvas,
      forceMock: this.forceMockBackend,
      now: this.clock.now()
    });
    const selection = this.backendSelection.select({
      capabilities: probe.capabilities,
      preferred: this.forceMockBackend ? 'mock' : this.configuration.preferredBackend,
      allowFallback: this.configuration.allowBackendFallback,
      allowMock: this.configuration.allowMockBackend || this.forceMockBackend
    });
    if (!selection.ok) {
      this.errorBoundary.capture(selection.error, this.clock.now());
      return selection;
    }

    this.diagnostics.setBackendInfo({
      backend: selection.value.selected,
      deviceName: probe.capabilities.deviceName,
      vendor: probe.capabilities.vendor
    });
    this.events.emit({
      type: 'backend',
      selected: selection.value.selected,
      available: selection.value.available,
      at: this.clock.now()
    });

    const created = await this.rendererBridge.createRenderer({
      canvas,
      forceBackend: selection.value.selected,
      capabilities: probe.capabilities,
      size: { width: info.bufferWidth, height: info.bufferHeight },
      clearColor: this.configuration.clearColor,
      ...(signal === undefined ? {} : { signal })
    });
    if (!created.ok) {
      this.errorBoundary.capture(created.error, this.clock.now());
      return created;
    }

    this.resources.track({
      id: 'renderer',
      kind: 'renderer',
      dispose: () => this.rendererBridge.dispose()
    });

    const finish = this.bootstrap.finishAttach();
    if (!finish.ok) {
      return finish;
    }
    return this.bootstrap.markSessionReady();
  }

  public run(): ViewportResult<void> {
    const phase = this.lifecycle.getPhase();
    if (phase === 'running' && this.renderLoop.isActive()) {
      return viewportSuccess(undefined);
    }
    if (phase === 'paused') {
      if (!this.lifecycle.transition('running')) {
        return viewportFailure('lifecycle', 'Cannot resume to running');
      }
    } else if (phase === 'session-ready') {
      if (!this.lifecycle.transition('running')) {
        return viewportFailure('lifecycle', 'Cannot start running');
      }
    } else if (phase !== 'running') {
      return viewportFailure('lifecycle', `Cannot run from phase ${phase}`);
    }
    this.events.emit({
      type: 'lifecycle',
      phase: 'running',
      at: this.clock.now()
    });
    const startupMs = this.clock.now() - this.startedAt;
    if (startupMs > this.configuration.startupBudgetMs) {
      this.diagnostics.warn(
        'startup-budget',
        `Startup ${startupMs.toFixed(1)}ms exceeded budget ${String(this.configuration.startupBudgetMs)}ms`,
        this.clock.now()
      );
    }
    if (this.renderLoop.isActive()) {
      return viewportSuccess(undefined);
    }
    return this.renderLoop.start();
  }

  public pause(): ViewportResult<void> {
    if (this.lifecycle.getPhase() === 'paused') {
      return viewportSuccess(undefined);
    }
    if (!this.lifecycle.transition('paused')) {
      return viewportFailure(
        'lifecycle',
        `Cannot pause from phase ${this.lifecycle.getPhase()}`
      );
    }
    this.renderLoop.stop();
    this.events.emit({
      type: 'lifecycle',
      phase: 'paused',
      at: this.clock.now()
    });
    return viewportSuccess(undefined);
  }

  public resume(): ViewportResult<void> {
    return this.run();
  }

  public resize(size: Size2D): ViewportResult<void> {
    const prior = this.lifecycle.getPhase();
    if (prior === 'running' || prior === 'paused') {
      this.lifecycle.transition('resizing');
      this.events.emit({
        type: 'lifecycle',
        phase: 'resizing',
        at: this.clock.now()
      });
    }
    this.resizeManager.requestResize(size);
    this.invalidate('resize');
    if (prior === 'running') {
      this.lifecycle.force('running');
    } else if (prior === 'paused') {
      this.lifecycle.force('paused');
    }
    return viewportSuccess(undefined);
  }

  public invalidate(reason = 'manual'): ViewportResult<void> {
    const prior = this.lifecycle.getPhase();
    if (prior === 'running' || prior === 'paused') {
      this.lifecycle.transition('invalidating');
    }
    this.diagnostics.recordInvalidation();
    this.renderLoop.invalidate(reason);
    this.events.emit({
      type: 'invalidate',
      reason,
      at: this.clock.now()
    });
    if (prior === 'running') {
      this.lifecycle.force('running');
    } else if (prior === 'paused') {
      this.lifecycle.force('paused');
    }
    return viewportSuccess(undefined);
  }

  public publishScene(snapshot: SceneSnapshot): ViewportResult<void> {
    this.sceneBridge.publish(snapshot);
    return this.invalidate('scene');
  }

  /** Deterministic single-frame pump for tests / on-demand hosts. */
  public pumpFrame(): ViewportResult<import('./frame-coordinator.js').FrameResult> {
    return this.renderLoop.pump();
  }

  public shutdown(): ViewportResult<void> {
    return this.shutdownHelper.shutdown();
  }

  public dispose(): ViewportResult<void> {
    this.overlays.clear();
    this.sceneBridge.clear();
    this.invalidation.clear();
    this.deviceCapabilities.clear();
    return this.shutdownHelper.dispose();
  }
}
