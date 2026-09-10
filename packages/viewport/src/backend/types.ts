import type { GpuCapabilities } from '../config.js';
import type {
  BackendKind,
  ColorRgba,
  Disposable,
  GpuHandle,
  RenderResult,
  Size2D
} from '../types.js';

export type BufferUsage =
  | 'vertex'
  | 'index'
  | 'uniform'
  | 'storage'
  | 'copy-src'
  | 'copy-dst';

export type TextureFormat =
  | 'rgba8unorm'
  | 'bgra8unorm'
  | 'rgba16float'
  | 'depth24plus'
  | 'depth32float'
  | 'r32uint';

export interface BufferCreateInfo {
  readonly size: number;
  readonly usage: readonly BufferUsage[];
  readonly label?: string;
  readonly initialData?: ArrayBufferView;
}

export interface TextureCreateInfo {
  readonly width: number;
  readonly height: number;
  readonly depth?: number;
  readonly format: TextureFormat;
  readonly mipLevels?: number;
  readonly sampleCount?: number;
  readonly label?: string;
  readonly cubemap?: boolean;
}

export interface RenderTargetCreateInfo {
  readonly width: number;
  readonly height: number;
  readonly colorFormats: readonly TextureFormat[];
  readonly depthFormat?: TextureFormat;
  readonly sampleCount?: number;
  readonly label?: string;
}

export interface PipelineCreateInfo {
  readonly label?: string;
  readonly shaderHandle: GpuHandle;
  readonly topology?: 'triangle-list' | 'line-list' | 'point-list';
  readonly depthTest?: boolean;
  readonly blend?: boolean;
}

export interface CommandBufferStats {
  readonly drawCalls: number;
  readonly dispatches: number;
  readonly bytesUploaded: number;
}

export interface GpuBackendStats {
  readonly backend: BackendKind;
  readonly frameIndex: number;
  readonly submittedCommandBuffers: number;
  readonly residentBufferBytes: number;
  readonly residentTextureBytes: number;
  readonly lastSubmitMs: number;
}

export interface GpuBackend extends Disposable {
  readonly kind: BackendKind;
  readonly capabilities: GpuCapabilities;
  initialize(
    canvas: HTMLCanvasElement | undefined,
    size: Size2D
  ): Promise<RenderResult<void>>;
  resize(size: Size2D): RenderResult<void>;
  beginFrame(clearColor: ColorRgba): RenderResult<void>;
  endFrame(): RenderResult<void>;
  createBuffer(info: BufferCreateInfo): RenderResult<GpuHandle>;
  createTexture(info: TextureCreateInfo): RenderResult<GpuHandle>;
  createRenderTarget(info: RenderTargetCreateInfo): RenderResult<GpuHandle>;
  createPipeline(info: PipelineCreateInfo): RenderResult<GpuHandle>;
  destroyResource(handle: GpuHandle): RenderResult<void>;
  uploadBuffer(
    handle: GpuHandle,
    data: ArrayBufferView,
    offset?: number
  ): RenderResult<void>;
  uploadTexture(
    handle: GpuHandle,
    data: ArrayBufferView,
    width: number,
    height: number
  ): RenderResult<void>;
  beginCommandBuffer(label?: string): RenderResult<GpuHandle>;
  endCommandBuffer(handle: GpuHandle): RenderResult<CommandBufferStats>;
  submit(commandBuffers: readonly GpuHandle[]): RenderResult<void>;
  readPixels(
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<RenderResult<Uint8ClampedArray>>;
  stats(): GpuBackendStats;
}
