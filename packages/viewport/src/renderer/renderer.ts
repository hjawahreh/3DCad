import { createGpuBackend } from '../backend/index.js';
import type { GpuBackend } from '../backend/types.js';
import {
  detectGpuCapabilities,
  resolveRendererConfig,
  type GpuCapabilities,
  type RendererConfig,
  type ResolvedRendererConfig
} from '../capability/index.js';
import { FrameExecutor } from '../frame/executor.js';
import { CanvasHost } from '../host/canvas-host.js';
import { MaterialRegistry } from '../materials/registry.js';
import { PassRegistry } from '../passes/registry.js';
import { RenderPipeline } from '../pipeline/pipeline.js';
import {
  RenderGraphBuilder,
  type CompiledRenderGraph
} from '../render-graph/graph.js';
import { GpuResourceManager } from '../resources/manager.js';
import {
  DebugRenderingService,
  PerformanceMetricsService,
  RendererRegistry,
  ResourceInspector,
  ScreenshotService,
  type RendererSessionInfo
} from '../services/services.js';
import { ShaderRegistry } from '../shaders/registry.js';
import { GpuTaskScheduler } from '../threading/scheduler.js';
import {
  asRendererId,
  type BackendKind,
  type Disposable,
  type FrameId,
  type RendererId,
  type RenderResult,
  type Size2D,
  renderFailure,
  renderSuccess
} from '../types.js';

let rendererSerial = 0;

export const createDefaultGraph = (): CompiledRenderGraph => {
  const builder = new RenderGraphBuilder();
  builder.addResource({ name: 'depth', kind: 'texture', lifetime: 'transient' });
  builder.addResource({ name: 'color', kind: 'texture', lifetime: 'transient' });
  builder.addResource({
    name: 'transparent',
    kind: 'texture',
    lifetime: 'transient'
  });
  builder.addResource({
    name: 'overlay',
    kind: 'texture',
    lifetime: 'transient'
  });
  builder.addResource({
    name: 'swapchain',
    kind: 'external',
    lifetime: 'external'
  });

  builder.addPass({
    id: 'depth',
    label: 'Depth Prepass',
    writes: ['depth']
  });
  builder.addPass({
    id: 'geometry',
    label: 'Geometry',
    reads: ['depth'],
    writes: ['color']
  });
  builder.addPass({
    id: 'transparency',
    label: 'Transparency',
    reads: ['color', 'depth'],
    writes: ['transparent']
  });
  builder.addPass({
    id: 'overlay',
    label: 'Overlay',
    reads: ['transparent'],
    writes: ['overlay', 'swapchain']
  });

  const compiled = builder.compile();
  if (!compiled.ok) {
    throw new Error(compiled.error.message);
  }
  return compiled.value;
};

export interface RendererCreateOptions extends RendererConfig {
  readonly canvas?: HTMLCanvasElement;
  readonly capabilities?: GpuCapabilities;
  readonly forceBackend?: BackendKind;
  readonly registry?: RendererRegistry;
}

export class Renderer implements Disposable {
  public readonly id: RendererId;
  public readonly config: ResolvedRendererConfig;
  public readonly capabilities: GpuCapabilities;
  public readonly backend: GpuBackend;
  public readonly resources: GpuResourceManager;
  public readonly materials: MaterialRegistry;
  public readonly shaders: ShaderRegistry;
  public readonly passes: PassRegistry;
  public readonly pipeline: RenderPipeline;
  public readonly host: CanvasHost;
  public readonly scheduler: GpuTaskScheduler;
  public readonly metrics: PerformanceMetricsService;
  public readonly screenshots: ScreenshotService;
  public readonly inspector: ResourceInspector;
  public readonly debug: DebugRenderingService;

  private readonly executor: FrameExecutor;
  private readonly registry: RendererRegistry | undefined;
  private graph: CompiledRenderGraph;
  private initialized = false;
  private disposed = false;
  private size: Size2D;

  public constructor(
    config: ResolvedRendererConfig,
    capabilities: GpuCapabilities,
    backend: GpuBackend,
    registry?: RendererRegistry
  ) {
    this.id = asRendererId(config.id);
    this.config = config;
    this.capabilities = capabilities;
    this.backend = backend;
    this.registry = registry;
    this.size = { ...config.canvasSize };
    this.resources = new GpuResourceManager(backend, config);
    this.materials = new MaterialRegistry();
    this.shaders = new ShaderRegistry();
    this.passes = new PassRegistry();
    this.pipeline = new RenderPipeline();
    this.host = new CanvasHost();
    this.scheduler = new GpuTaskScheduler();
    this.debug = new DebugRenderingService();
    this.graph = createDefaultGraph();
    this.pipeline.setGraph(this.graph);

    this.executor = new FrameExecutor(backend, this.pipeline, this.resources, {
      enableProfiling: config.enableProfiling,
      clearColor: config.clearColor,
      size: this.size
    });
    this.metrics = new PerformanceMetricsService(
      backend,
      this.resources,
      this.executor.getStats()
    );
    this.screenshots = new ScreenshotService(backend, () => this.size);
    this.inspector = new ResourceInspector(this.resources);

    if (registry !== undefined) {
      const registered = registry.register({
        id: this.id,
        dispose: () => this.dispose(),
        sessionInfo: () => this.sessionInfo()
      });
      if (!registered.ok) {
        throw new Error(registered.error.message);
      }
    }
  }

  public getGraph(): CompiledRenderGraph {
    return this.graph;
  }

  public setGraph(graph: CompiledRenderGraph): void {
    this.graph = graph;
    this.pipeline.setGraph(graph);
  }

  public async initialize(
    canvas?: HTMLCanvasElement
  ): Promise<RenderResult<void>> {
    if (this.disposed) {
      return renderFailure('unavailable', 'Renderer is disposed.');
    }
    if (canvas !== undefined) {
      this.host.attach(canvas, (size) => {
        void this.resize(size);
      });
      this.size = this.host.getSize();
    }
    const init = await this.backend.initialize(canvas, this.size);
    if (!init.ok) return init;
    this.executor.resize(this.size);
    this.initialized = true;
    return renderSuccess(undefined);
  }

  public resize(size: Size2D): RenderResult<void> {
    if (this.disposed) {
      return renderFailure('unavailable', 'Renderer is disposed.');
    }
    this.size = {
      width: Math.max(1, size.width),
      height: Math.max(1, size.height)
    };
    this.host.setSize(this.size);
    this.executor.resize(this.size);
    if (this.initialized) {
      return this.backend.resize(this.size);
    }
    return renderSuccess(undefined);
  }

  public renderFrame(
    update?: Parameters<FrameExecutor['execute']>[0]
  ): RenderResult<FrameId> {
    if (this.disposed) {
      return renderFailure('unavailable', 'Renderer is disposed.');
    }
    if (!this.initialized) {
      return renderFailure('unavailable', 'Renderer is not initialized.');
    }
    return this.executor.execute(update);
  }

  public sessionInfo(): RendererSessionInfo {
    return {
      id: this.id,
      backend: this.backend.kind,
      size: { ...this.size },
      disposed: this.disposed
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduler.dispose();
    this.passes.dispose();
    this.materials.dispose();
    this.shaders.dispose();
    this.resources.dispose();
    this.pipeline.clear();
    this.host.detach();
    this.backend.dispose();
    this.registry?.unregister(this.id);
  }
}

export class RendererFactory {
  public constructor(private readonly registry: RendererRegistry = new RendererRegistry()) {}

  public getRegistry(): RendererRegistry {
    return this.registry;
  }

  public async create(
    options: RendererCreateOptions = {}
  ): Promise<RenderResult<Renderer>> {
    const generatedId = options.id ?? `renderer-${++rendererSerial}`;
    const config = resolveRendererConfig(options, generatedId);
    const capabilities =
      options.capabilities ??
      detectGpuCapabilities({
        ...(options.canvas !== undefined ? { canvas: options.canvas } : {}),
        ...(options.forceBackend === 'mock' ? { forceMock: true } : {})
      });
    const backend = createGpuBackend(
      capabilities,
      config,
      options.forceBackend
    );
    try {
      const renderer = new Renderer(
        config,
        capabilities,
        backend,
        options.registry ?? this.registry
      );
      const init = await renderer.initialize(options.canvas);
      if (!init.ok) {
        renderer.dispose();
        return init;
      }
      return renderSuccess(renderer);
    } catch (cause) {
      backend.dispose();
      return renderFailure(
        'unexpected',
        cause instanceof Error ? cause.message : 'Failed to create renderer.',
        cause
      );
    }
  }
}

export const createRenderer = async (
  options: RendererCreateOptions = {}
): Promise<RenderResult<Renderer>> => {
  const factory = new RendererFactory(options.registry);
  return factory.create(options);
};
