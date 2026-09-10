import type { SceneSnapshot } from '@cad-studio/scene';
import type { CanvasHost } from './canvas-host.js';
import type { ViewportDiagnostics } from './diagnostics.js';
import type { ViewportEvents } from './events.js';
import type { FrameInvalidation } from './frame-invalidation.js';
import type { ViewportMetrics } from './metrics.js';
import type { PerformanceMonitor } from './performance-monitor.js';
import type { PresentationScheduler } from './presentation-scheduler.js';
import type { RendererBridge } from './renderer-bridge.js';
import type { RenderSurface } from './render-surface.js';
import type { ViewportResizeManager } from './resize-manager.js';
import type { SceneBridge } from './scene-bridge.js';
import type { FrameClock } from './types.js';
import { viewportFailure, viewportSuccess, type ViewportResult } from './types.js';
import type { ErrorBoundary } from './error-boundary.js';
import type { RecoveryCoordinator } from './error-boundary.js';

export interface FrameCoordinatorDeps {
  readonly clock: FrameClock;
  readonly resizeManager: ViewportResizeManager;
  readonly invalidation: FrameInvalidation;
  readonly sceneBridge: SceneBridge;
  readonly rendererBridge: RendererBridge;
  readonly presentation: PresentationScheduler;
  readonly surface: RenderSurface;
  readonly canvasHost: CanvasHost;
  readonly metrics: ViewportMetrics;
  readonly diagnostics: ViewportDiagnostics;
  readonly performance: PerformanceMonitor;
  readonly events: ViewportEvents;
  readonly errorBoundary: ErrorBoundary;
  readonly recovery: RecoveryCoordinator;
  readonly targetFrameMs: number;
}

export interface FrameResult {
  readonly frameNumber: number;
  readonly durationMs: number;
  readonly presented: boolean;
  readonly snapshot: SceneSnapshot | undefined;
}

/**
 * Executes one frame pipeline:
 * Begin → Resize → Invalidations → Acquire Snapshot → Submit → Present → Metrics → End
 * Never renders geometry itself.
 */
export class FrameCoordinator {
  private frameNumber = 0;

  public constructor(private readonly deps: FrameCoordinatorDeps) {}

  public getFrameNumber(): number {
    return this.frameNumber;
  }

  public runFrame(signal?: AbortSignal): ViewportResult<FrameResult> {
    if (signal?.aborted === true) {
      return viewportFailure('cancelled', 'Frame cancelled');
    }
    if (this.deps.canvasHost.isContextLost()) {
      const error = {
        code: 'context-lost' as const,
        message: 'GPU context lost; frame skipped'
      };
      this.deps.errorBoundary.capture(error, this.deps.clock.now());
      return viewportFailure(error.code, error.message);
    }

    const started = this.deps.clock.now();
    this.frameNumber += 1;

    // Process Resize
    const resizeStarted = this.deps.clock.now();
    const resized = this.deps.resizeManager.process();
    if (resized !== undefined) {
      this.deps.surface.set(
        { width: resized.bufferWidth, height: resized.bufferHeight },
        resized.devicePixelRatio
      );
      const resizeResult = this.deps.rendererBridge.resize({
        width: resized.bufferWidth,
        height: resized.bufferHeight
      });
      this.deps.diagnostics.recordResize();
      this.deps.metrics.recordResize(this.deps.clock.now() - resizeStarted);
      this.deps.events.emit({
        type: 'resize',
        size: { width: resized.cssWidth, height: resized.cssHeight },
        devicePixelRatio: resized.devicePixelRatio,
        at: this.deps.clock.now()
      });
      if (!resizeResult.ok) {
        this.deps.errorBoundary.capture(resizeResult.error, this.deps.clock.now());
        return resizeResult;
      }
    }

    // Process Invalidations
    const reasons = this.deps.invalidation.consume();
    if (reasons.length > 0) {
      this.deps.presentation.requestPresent();
    }

    // Acquire Scene Snapshot
    const snapshot = this.deps.sceneBridge.acquire();

    let presented = false;
    if (snapshot !== undefined && this.deps.presentation.shouldPresent()) {
      this.deps.presentation.consumePresent();
      const submit = this.deps.rendererBridge.submit(snapshot);
      if (!submit.ok) {
        this.deps.errorBoundary.capture(submit.error, this.deps.clock.now());
        const action = this.deps.recovery.decide(submit.error);
        if (action === 'invalidate') {
          this.deps.invalidation.invalidate('recovery');
        }
        return submit;
      }
      presented = true;
    } else if (this.deps.presentation.shouldPresent()) {
      // Present without new snapshot (clear / keep prior): still drive Graphics Engine frame
      this.deps.presentation.consumePresent();
      const render = this.deps.rendererBridge.getHost().renderFrame();
      if (!render.ok) {
        this.deps.errorBoundary.capture(render.error, this.deps.clock.now());
        return render;
      }
      presented = true;
    }

    const ended = this.deps.clock.now();
    const durationMs = ended - started;
    const dropped = durationMs > this.deps.targetFrameMs * 1.5;
    this.deps.performance.observe({
      frameMs: durationMs,
      cpuMs: durationMs,
      presentationLatencyMs: durationMs,
      now: ended,
      dropped
    });
    this.deps.events.emit({
      type: 'frame',
      frameNumber: this.frameNumber,
      durationMs,
      at: ended
    });

    return viewportSuccess(
      Object.freeze({
        frameNumber: this.frameNumber,
        durationMs,
        presented,
        snapshot
      })
    );
  }
}
