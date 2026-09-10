import type { BackendKind, Size2D } from './types.js';

export interface GpuFeatureFlags {
  readonly compute: boolean;
  readonly storageBuffers: boolean;
  readonly float32Filterable: boolean;
  readonly timestampQuery: boolean;
  readonly multipleRenderTargets: boolean;
  readonly depthTexture: boolean;
  readonly anisotropicFiltering: boolean;
  readonly instancing: boolean;
  readonly textureCompression: boolean;
}

export interface GpuLimits {
  readonly maxTextureSize: number;
  readonly maxCubeMapSize: number;
  readonly maxBufferSize: number;
  readonly maxColorAttachments: number;
  readonly maxAnisotropy: number;
  readonly maxVertexAttributes: number;
  readonly maxUniformBufferBindingSize: number;
  readonly maxComputeWorkgroupSizeX: number;
}

export interface GpuCapabilities {
  readonly preferredBackend: BackendKind;
  readonly availableBackends: readonly BackendKind[];
  readonly features: GpuFeatureFlags;
  readonly limits: GpuLimits;
  readonly deviceName: string;
  readonly vendor: string;
  readonly renderer: string;
  readonly isSoftwareRasterizer: boolean;
}

export interface RendererConfig {
  readonly id?: string;
  readonly preferredBackend?: BackendKind;
  readonly allowFallback?: boolean;
  readonly targetFps?: number;
  readonly enableProfiling?: boolean;
  readonly enableDebugOverlay?: boolean;
  readonly maxTransientMemoryBytes?: number;
  readonly maxPersistentMemoryBytes?: number;
  readonly clearColor?: {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
  };
  readonly canvasSize?: Size2D;
  readonly powerPreference?: 'high-performance' | 'low-power';
}

export const DEFAULT_RENDERER_CONFIG: Required<
  Omit<RendererConfig, 'id' | 'preferredBackend' | 'canvasSize'>
> & {
  readonly preferredBackend: BackendKind;
  readonly canvasSize: Size2D;
} = {
  preferredBackend: 'webgpu',
  allowFallback: true,
  targetFps: 120,
  enableProfiling: true,
  enableDebugOverlay: false,
  maxTransientMemoryBytes: 256 * 1024 * 1024,
  maxPersistentMemoryBytes: 1024 * 1024 * 1024,
  clearColor: { r: 0.08, g: 0.09, b: 0.11, a: 1 },
  canvasSize: { width: 1, height: 1 },
  powerPreference: 'high-performance'
};

export interface ResolvedRendererConfig {
  readonly id: string;
  readonly preferredBackend: BackendKind;
  readonly allowFallback: boolean;
  readonly targetFps: number;
  readonly enableProfiling: boolean;
  readonly enableDebugOverlay: boolean;
  readonly maxTransientMemoryBytes: number;
  readonly maxPersistentMemoryBytes: number;
  readonly clearColor: {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
  };
  readonly canvasSize: Size2D;
  readonly powerPreference: 'high-performance' | 'low-power';
}

export const resolveRendererConfig = (
  config: RendererConfig | undefined,
  generatedId: string
): ResolvedRendererConfig => {
  const resolved = config ?? {};
  return {
    id: resolved.id ?? generatedId,
    preferredBackend: resolved.preferredBackend ?? DEFAULT_RENDERER_CONFIG.preferredBackend,
    allowFallback: resolved.allowFallback ?? DEFAULT_RENDERER_CONFIG.allowFallback,
    targetFps: resolved.targetFps ?? DEFAULT_RENDERER_CONFIG.targetFps,
    enableProfiling: resolved.enableProfiling ?? DEFAULT_RENDERER_CONFIG.enableProfiling,
    enableDebugOverlay: resolved.enableDebugOverlay ?? DEFAULT_RENDERER_CONFIG.enableDebugOverlay,
    maxTransientMemoryBytes:
      resolved.maxTransientMemoryBytes ?? DEFAULT_RENDERER_CONFIG.maxTransientMemoryBytes,
    maxPersistentMemoryBytes:
      resolved.maxPersistentMemoryBytes ?? DEFAULT_RENDERER_CONFIG.maxPersistentMemoryBytes,
    clearColor: resolved.clearColor ?? DEFAULT_RENDERER_CONFIG.clearColor,
    canvasSize: resolved.canvasSize ?? DEFAULT_RENDERER_CONFIG.canvasSize,
    powerPreference: resolved.powerPreference ?? DEFAULT_RENDERER_CONFIG.powerPreference
  };
};
