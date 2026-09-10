import type { GpuCapabilities, ResolvedRendererConfig } from '../config.js';
import {
  asGpuHandle,
  type ColorRgba,
  type GpuHandle,
  type RenderResult,
  type Size2D,
  renderFailure,
  renderSuccess
} from '../types.js';
import type {
  BufferCreateInfo,
  CommandBufferStats,
  GpuBackend,
  GpuBackendStats,
  PipelineCreateInfo,
  RenderTargetCreateInfo,
  TextureCreateInfo
} from './types.js';

interface ThreeWebGlRenderer {
  setSize(width: number, height: number, updateStyle?: boolean): void;
  dispose(): void;
  setClearColor?(color: number, alpha?: number): void;
}

type ResourceKind =
  | 'buffer'
  | 'texture'
  | 'render-target'
  | 'pipeline'
  | 'command-buffer'
  | 'shader';

interface TrackedResource {
  readonly kind: ResourceKind;
  readonly byteSize: number;
  readonly label?: string;
  data?: Uint8Array;
  drawCalls: number;
  dispatches: number;
  bytesUploaded: number;
  open: boolean;
}

export class WebGl2Backend implements GpuBackend {
  public readonly kind = 'webgl2' as const;
  public readonly capabilities: GpuCapabilities;

  private readonly resources = new Map<number, TrackedResource>();
  private nextHandle = 1;
  private size: Size2D;
  private frameIndex = 0;
  private submittedCommandBuffers = 0;
  private lastSubmitMs = 0;
  private initialized = false;
  private disposed = false;
  private inFrame = false;
  private clearColor: ColorRgba = { r: 0, g: 0, b: 0, a: 1 };
  private threeRenderer: ThreeWebGlRenderer | undefined;
  private stubMode = true;

  public constructor(
    capabilities: GpuCapabilities,
    private readonly config: ResolvedRendererConfig
  ) {
    this.capabilities = capabilities;
    this.size = { ...config.canvasSize };
    this.clearColor = { ...config.clearColor };
  }

  public async initialize(
    canvas: HTMLCanvasElement | undefined,
    size: Size2D
  ): Promise<RenderResult<void>> {
    if (this.disposed) {
      return renderFailure('unavailable', 'WebGL2 backend is disposed.');
    }
    this.size = { width: Math.max(1, size.width), height: Math.max(1, size.height) };

    if (canvas !== undefined) {
      try {
        const mod = (await import('three')) as {
          WebGLRenderer?: new (params: {
            canvas: HTMLCanvasElement;
            context?: WebGL2RenderingContext | null;
            powerPreference?: string;
            antialias?: boolean;
          }) => ThreeWebGlRenderer;
        };
        if (typeof mod.WebGLRenderer === 'function') {
          const context =
            typeof canvas.getContext === 'function'
              ? canvas.getContext('webgl2', {
                  powerPreference: this.config.powerPreference
                })
              : null;
          const renderer = new mod.WebGLRenderer({
            canvas,
            context,
            powerPreference: this.config.powerPreference,
            antialias: false
          });
          renderer.setSize(this.size.width, this.size.height, false);
          this.threeRenderer = renderer;
          this.stubMode = false;
        }
      } catch {
        this.stubMode = true;
        this.threeRenderer = undefined;
      }
    }

    this.initialized = true;
    return renderSuccess(undefined);
  }

  public resize(size: Size2D): RenderResult<void> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    this.size = { width: Math.max(1, size.width), height: Math.max(1, size.height) };
    this.threeRenderer?.setSize(this.size.width, this.size.height, false);
    return renderSuccess(undefined);
  }

  public beginFrame(clearColor: ColorRgba): RenderResult<void> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    if (this.inFrame) {
      return renderFailure('conflict', 'Frame already begun.');
    }
    this.inFrame = true;
    this.clearColor = { ...clearColor };
    this.frameIndex += 1;
    if (this.threeRenderer?.setClearColor !== undefined) {
      const packed =
        (Math.round(clearColor.r * 255) << 16) |
        (Math.round(clearColor.g * 255) << 8) |
        Math.round(clearColor.b * 255);
      this.threeRenderer.setClearColor(packed, clearColor.a);
    }
    return renderSuccess(undefined);
  }

  public endFrame(): RenderResult<void> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    if (!this.inFrame) {
      return renderFailure('invalid', 'No frame in progress.');
    }
    this.inFrame = false;
    return renderSuccess(undefined);
  }

  public createBuffer(info: BufferCreateInfo): RenderResult<GpuHandle> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    if (info.size <= 0) {
      return renderFailure('validation', 'Buffer size must be positive.');
    }
    const handle = this.allocate('buffer', info.size, info.label);
    const resource = this.resources.get(handle)!;
    resource.data = new Uint8Array(info.size);
    if (info.initialData !== undefined) {
      const view = new Uint8Array(
        info.initialData.buffer,
        info.initialData.byteOffset,
        info.initialData.byteLength
      );
      resource.data.set(view.subarray(0, Math.min(view.byteLength, info.size)));
    }
    return renderSuccess(asGpuHandle(handle));
  }

  public createTexture(info: TextureCreateInfo): RenderResult<GpuHandle> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    if (info.width <= 0 || info.height <= 0) {
      return renderFailure('validation', 'Texture dimensions must be positive.');
    }
    const depth = info.depth ?? (info.cubemap === true ? 6 : 1);
    const mipLevels = info.mipLevels ?? 1;
    const sampleCount = info.sampleCount ?? 1;
    const bytesPerPixel = info.format.includes('float') ? 8 : 4;
    const byteSize = info.width * info.height * depth * bytesPerPixel * mipLevels * sampleCount;
    const handle = this.allocate('texture', byteSize, info.label);
    return renderSuccess(asGpuHandle(handle));
  }

  public createRenderTarget(info: RenderTargetCreateInfo): RenderResult<GpuHandle> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    if (info.width <= 0 || info.height <= 0 || info.colorFormats.length === 0) {
      return renderFailure('validation', 'Invalid render target descriptor.');
    }
    const sampleCount = info.sampleCount ?? 1;
    const colorBytes = info.colorFormats.length * info.width * info.height * 4 * sampleCount;
    const depthBytes = info.depthFormat !== undefined ? info.width * info.height * 4 : 0;
    const handle = this.allocate('render-target', colorBytes + depthBytes, info.label);
    return renderSuccess(asGpuHandle(handle));
  }

  public createPipeline(info: PipelineCreateInfo): RenderResult<GpuHandle> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    if (!this.resources.has(Number(info.shaderHandle)) && !this.stubMode) {
      return renderFailure('not-found', 'Shader handle does not exist.');
    }
    const handle = this.allocate('pipeline', 96, info.label);
    return renderSuccess(asGpuHandle(handle));
  }

  public destroyResource(handle: GpuHandle): RenderResult<void> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    if (!this.resources.delete(Number(handle))) {
      return renderFailure('not-found', `Resource ${String(handle)} not found.`);
    }
    return renderSuccess(undefined);
  }

  public uploadBuffer(
    handle: GpuHandle,
    data: ArrayBufferView,
    offset = 0
  ): RenderResult<void> {
    const resource = this.requireResource(handle, 'buffer');
    if (!resource.ok) return resource;
    const tracked = resource.value;
    if (tracked.data === undefined) {
      return renderFailure('invalid', 'Buffer has no storage.');
    }
    if (offset < 0 || offset + data.byteLength > tracked.data.byteLength) {
      return renderFailure('validation', 'Upload exceeds buffer bounds.');
    }
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    tracked.data.set(view, offset);
    tracked.bytesUploaded += data.byteLength;
    return renderSuccess(undefined);
  }

  public uploadTexture(
    handle: GpuHandle,
    data: ArrayBufferView,
    width: number,
    height: number
  ): RenderResult<void> {
    const resource = this.requireResource(handle, 'texture');
    if (!resource.ok) return resource;
    if (width <= 0 || height <= 0) {
      return renderFailure('validation', 'Texture upload size must be positive.');
    }
    resource.value.bytesUploaded += data.byteLength;
    return renderSuccess(undefined);
  }

  public beginCommandBuffer(label?: string): RenderResult<GpuHandle> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    const handle = this.allocate('command-buffer', 0, label);
    this.resources.get(handle)!.open = true;
    return renderSuccess(asGpuHandle(handle));
  }

  public endCommandBuffer(handle: GpuHandle): RenderResult<CommandBufferStats> {
    const resource = this.requireResource(handle, 'command-buffer');
    if (!resource.ok) return resource;
    const tracked = resource.value;
    if (!tracked.open) {
      return renderFailure('invalid', 'Command buffer is already closed.');
    }
    tracked.open = false;
    return renderSuccess({
      drawCalls: tracked.drawCalls,
      dispatches: tracked.dispatches,
      bytesUploaded: tracked.bytesUploaded
    });
  }

  public submit(commandBuffers: readonly GpuHandle[]): RenderResult<void> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    const started = performance.now();
    for (const handle of commandBuffers) {
      const resource = this.requireResource(handle, 'command-buffer');
      if (!resource.ok) return resource;
      if (resource.value.open) {
        return renderFailure('invalid', 'Cannot submit an open command buffer.');
      }
    }
    this.submittedCommandBuffers += commandBuffers.length;
    this.lastSubmitMs = performance.now() - started;
    return renderSuccess(undefined);
  }

  public async readPixels(
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<RenderResult<Uint8ClampedArray>> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    if (width <= 0 || height <= 0 || x < 0 || y < 0) {
      return renderFailure('validation', 'Invalid readPixels region.');
    }
    if (x + width > this.size.width || y + height > this.size.height) {
      return renderFailure('validation', 'readPixels region exceeds surface.');
    }
    const pixels = new Uint8ClampedArray(width * height * 4);
    const { r, g, b, a } = this.clearColor;
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = Math.round(r * 255);
      pixels[i + 1] = Math.round(g * 255);
      pixels[i + 2] = Math.round(b * 255);
      pixels[i + 3] = Math.round(a * 255);
    }
    return renderSuccess(pixels);
  }

  public stats(): GpuBackendStats {
    let residentBufferBytes = 0;
    let residentTextureBytes = 0;
    for (const resource of this.resources.values()) {
      if (resource.kind === 'buffer') residentBufferBytes += resource.byteSize;
      if (resource.kind === 'texture' || resource.kind === 'render-target') {
        residentTextureBytes += resource.byteSize;
      }
    }
    return {
      backend: this.kind,
      frameIndex: this.frameIndex,
      submittedCommandBuffers: this.submittedCommandBuffers,
      residentBufferBytes,
      residentTextureBytes,
      lastSubmitMs: this.lastSubmitMs
    };
  }

  public dispose(): void {
    this.threeRenderer?.dispose();
    this.threeRenderer = undefined;
    this.resources.clear();
    this.disposed = true;
    this.initialized = false;
    this.inFrame = false;
  }

  private allocate(kind: ResourceKind, byteSize: number, label?: string): number {
    const handle = this.nextHandle++;
    const entry: TrackedResource =
      label !== undefined
        ? {
            kind,
            byteSize,
            label,
            drawCalls: 0,
            dispatches: 0,
            bytesUploaded: 0,
            open: false
          }
        : {
            kind,
            byteSize,
            drawCalls: 0,
            dispatches: 0,
            bytesUploaded: 0,
            open: false
          };
    this.resources.set(handle, entry);
    return handle;
  }

  private requireReady(): RenderResult<void> {
    if (this.disposed) {
      return renderFailure('unavailable', 'WebGL2 backend is disposed.');
    }
    if (!this.initialized) {
      return renderFailure('unavailable', 'WebGL2 backend is not initialized.');
    }
    return renderSuccess(undefined);
  }

  private requireResource(
    handle: GpuHandle,
    kind: ResourceKind
  ): RenderResult<TrackedResource> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;
    const resource = this.resources.get(Number(handle));
    if (resource === undefined) {
      return renderFailure('not-found', `Resource ${String(handle)} not found.`);
    }
    if (resource.kind !== kind) {
      return renderFailure('invalid', `Expected ${kind} but found ${resource.kind}.`);
    }
    return renderSuccess(resource);
  }
}
