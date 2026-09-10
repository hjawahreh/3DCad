import type { ViewportLifecycle } from './lifecycle.js';
import type { ViewportEvents } from './events.js';
import type { ResourceLifecycle } from './resource-lifecycle.js';
import type { RenderLoop } from './render-loop.js';
import type { RendererBridge } from './renderer-bridge.js';
import type { CanvasHost } from './canvas-host.js';
import type { FrameClock } from './types.js';
import { viewportSuccess, type ViewportResult } from './types.js';

/**
 * Ordered shutdown: stop loop → detach canvas → dispose renderer → release resources → dispose.
 */
export class ViewportShutdown {
  public constructor(
    private readonly lifecycle: ViewportLifecycle,
    private readonly events: ViewportEvents,
    private readonly clock: FrameClock,
    private readonly renderLoop: RenderLoop,
    private readonly rendererBridge: RendererBridge,
    private readonly canvasHost: CanvasHost,
    private readonly resources: ResourceLifecycle
  ) {}

  public shutdown(): ViewportResult<void> {
    if (this.lifecycle.isTerminal()) {
      return viewportSuccess(undefined);
    }
    if (!this.lifecycle.transition('shutting-down') && !this.lifecycle.isTerminal()) {
      this.lifecycle.force('shutting-down');
    }
    this.events.emit({
      type: 'lifecycle',
      phase: 'shutting-down',
      at: this.clock.now()
    });

    this.renderLoop.stop();
    this.canvasHost.detach();
    this.rendererBridge.dispose();
    this.resources.disposeAll();

    this.lifecycle.force('shutdown');
    this.events.emit({
      type: 'lifecycle',
      phase: 'shutdown',
      at: this.clock.now()
    });
    return viewportSuccess(undefined);
  }

  public dispose(): ViewportResult<void> {
    const shutdown = this.shutdown();
    if (!shutdown.ok) {
      return shutdown;
    }
    if (!this.lifecycle.transition('disposed') && this.lifecycle.getPhase() !== 'disposed') {
      this.lifecycle.force('disposed');
    }
    this.events.emit({
      type: 'lifecycle',
      phase: 'disposed',
      at: this.clock.now()
    });
    this.events.clear();
    return viewportSuccess(undefined);
  }
}
