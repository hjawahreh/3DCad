import type { GpuBackend } from '../backend/types.js';
import type { FrameStatsCollector, FrameStatsSnapshot } from '../frame/timing.js';
import type { ManagedResource, GpuResourceManager } from '../resources/manager.js';
import type { Disposable, RendererId, RenderResult, Size2D } from '../types.js';
import { renderFailure, renderSuccess } from '../types.js';

export interface PerformanceMetrics {
  readonly backend: string;
  readonly frameStats: FrameStatsSnapshot;
  readonly gpu: ReturnType<GpuBackend['stats']>;
  readonly resources: ReturnType<GpuResourceManager['budgets']>;
}

export class PerformanceMetricsService {
  public constructor(
    private readonly backend: GpuBackend,
    private readonly resources: GpuResourceManager,
    private readonly stats: FrameStatsCollector
  ) {}

  public snapshot(): PerformanceMetrics {
    return {
      backend: this.backend.kind,
      frameStats: this.stats.snapshot(),
      gpu: this.backend.stats(),
      resources: this.resources.budgets()
    };
  }
}

export interface ScreenshotRequest {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

export class ScreenshotService {
  public constructor(
    private readonly backend: GpuBackend,
    private readonly getSize: () => Size2D
  ) {}

  public async capture(
    request: ScreenshotRequest = {}
  ): Promise<RenderResult<Uint8ClampedArray>> {
    const size = this.getSize();
    const x = request.x ?? 0;
    const y = request.y ?? 0;
    const width = request.width ?? size.width;
    const height = request.height ?? size.height;
    return this.backend.readPixels(x, y, width, height);
  }
}

export interface ResourceInspectorEntry {
  readonly id: string;
  readonly kind: string;
  readonly lifetime: string;
  readonly byteSize: number;
  readonly refCount: number;
  readonly key: string;
}

export class ResourceInspector {
  public constructor(private readonly resources: GpuResourceManager) {}

  public list(): readonly ResourceInspectorEntry[] {
    return Object.freeze(
      this.resources.list().map((resource: ManagedResource) => ({
        id: String(resource.id),
        kind: resource.kind,
        lifetime: resource.lifetime,
        byteSize: resource.byteSize,
        refCount: resource.refCount,
        key: resource.key
      }))
    );
  }

  public budgets(): ReturnType<GpuResourceManager['budgets']> {
    return this.resources.budgets();
  }
}

export interface DebugRenderingState {
  readonly wireframe: boolean;
  readonly showBounds: boolean;
  readonly showOverdraw: boolean;
  readonly freezeCulling: boolean;
}

export class DebugRenderingService {
  private state: DebugRenderingState = {
    wireframe: false,
    showBounds: false,
    showOverdraw: false,
    freezeCulling: false
  };

  public getState(): DebugRenderingState {
    return this.state;
  }

  public setState(partial: Partial<DebugRenderingState>): DebugRenderingState {
    this.state = Object.freeze({ ...this.state, ...partial });
    return this.state;
  }

  public reset(): void {
    this.state = Object.freeze({
      wireframe: false,
      showBounds: false,
      showOverdraw: false,
      freezeCulling: false
    });
  }
}

export interface RendererSessionInfo {
  readonly id: RendererId;
  readonly backend: string;
  readonly size: Size2D;
  readonly disposed: boolean;
}

export interface RegisteredRenderer {
  readonly id: RendererId;
  readonly dispose: () => void;
  readonly sessionInfo: () => RendererSessionInfo;
}

export class RendererRegistry implements Disposable {
  private readonly renderers = new Map<RendererId, RegisteredRenderer>();

  public register(renderer: RegisteredRenderer): RenderResult<void> {
    if (this.renderers.has(renderer.id)) {
      return renderFailure(
        'conflict',
        `Renderer ${String(renderer.id)} already registered.`
      );
    }
    this.renderers.set(renderer.id, renderer);
    return renderSuccess(undefined);
  }

  public unregister(id: RendererId): RenderResult<void> {
    if (!this.renderers.delete(id)) {
      return renderFailure('not-found', `Renderer ${String(id)} not registered.`);
    }
    return renderSuccess(undefined);
  }

  public get(id: RendererId): RegisteredRenderer | undefined {
    return this.renderers.get(id);
  }

  public list(): readonly RegisteredRenderer[] {
    return Object.freeze([...this.renderers.values()]);
  }

  public dispose(): void {
    for (const renderer of this.renderers.values()) renderer.dispose();
    this.renderers.clear();
  }
}
