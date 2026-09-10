import type { GpuCapabilities, GpuFeatureFlags, GpuLimits } from '../config.js';
import type { BackendKind } from '../types.js';

export interface CapabilityProbeOptions {
  readonly canvas?: HTMLCanvasElement;
  readonly forceMock?: boolean;
}

const SOFTWARE_RENDERER_HINTS = [
  'swiftshader',
  'llvmpipe',
  'softpipe',
  'microsoft basic render'
] as const;

const defaultFeatures = (kind: BackendKind): GpuFeatureFlags => ({
  compute: kind === 'webgpu',
  storageBuffers: kind === 'webgpu',
  float32Filterable: kind !== 'mock',
  timestampQuery: kind === 'webgpu',
  multipleRenderTargets: true,
  depthTexture: true,
  anisotropicFiltering: kind !== 'mock',
  instancing: true,
  textureCompression: kind === 'webgpu'
});

const defaultLimits = (kind: BackendKind): GpuLimits => ({
  maxTextureSize: kind === 'mock' ? 4096 : 8192,
  maxCubeMapSize: kind === 'mock' ? 2048 : 4096,
  maxBufferSize: kind === 'mock' ? 64 * 1024 * 1024 : 256 * 1024 * 1024,
  maxColorAttachments: kind === 'webgl2' ? 4 : 8,
  maxAnisotropy: kind === 'mock' ? 1 : 16,
  maxVertexAttributes: 16,
  maxUniformBufferBindingSize: kind === 'webgpu' ? 65536 : 16384,
  maxComputeWorkgroupSizeX: kind === 'webgpu' ? 256 : 0
});

const readWebGlInfo = (
  canvas: HTMLCanvasElement | undefined
): { readonly vendor: string; readonly renderer: string } => {
  if (canvas === undefined || typeof canvas.getContext !== 'function') {
    return { vendor: 'unknown', renderer: 'unavailable' };
  }
  const gl =
    canvas.getContext('webgl2', { powerPreference: 'high-performance' }) ??
    canvas.getContext('webgl');
  if (gl === null) {
    return { vendor: 'unknown', renderer: 'unavailable' };
  }
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const vendor =
    debugInfo === null
      ? String(gl.getParameter(gl.VENDOR))
      : String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
  const renderer =
    debugInfo === null
      ? String(gl.getParameter(gl.RENDERER))
      : String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
  const lose = gl.getExtension('WEBGL_lose_context');
  lose?.loseContext();
  return { vendor, renderer };
};

const isSoftware = (renderer: string): boolean => {
  const lower = renderer.toLowerCase();
  return SOFTWARE_RENDERER_HINTS.some((hint) => lower.includes(hint));
};

export const detectGpuCapabilities = (
  options: CapabilityProbeOptions = {}
): GpuCapabilities => {
  if (options.forceMock === true) {
    return {
      preferredBackend: 'mock',
      availableBackends: ['mock'],
      features: defaultFeatures('mock'),
      limits: defaultLimits('mock'),
      deviceName: 'MockGPU',
      vendor: 'cad-studio',
      renderer: 'MockGpuBackend',
      isSoftwareRasterizer: true
    };
  }

  const available: BackendKind[] = [];
  const hasNavigator = typeof navigator !== 'undefined';
  const gpu = hasNavigator
    ? (navigator as Navigator & { gpu?: unknown }).gpu
    : undefined;
  if (gpu !== undefined) {
    available.push('webgpu');
  }

  const info = readWebGlInfo(options.canvas);
  const canWebGl2 =
    typeof document !== 'undefined' ||
    (options.canvas !== undefined && typeof options.canvas.getContext === 'function');
  if (canWebGl2) {
    available.push('webgl2');
  }
  if (available.length === 0) {
    available.push('mock');
  }

  const preferredBackend: BackendKind = available.includes('webgpu')
    ? 'webgpu'
    : available.includes('webgl2')
      ? 'webgl2'
      : 'mock';

  return {
    preferredBackend,
    availableBackends: available,
    features: defaultFeatures(preferredBackend),
    limits: defaultLimits(preferredBackend),
    deviceName: info.renderer,
    vendor: info.vendor,
    renderer: info.renderer,
    isSoftwareRasterizer: isSoftware(info.renderer)
  };
};

export const selectBackend = (
  capabilities: GpuCapabilities,
  preferred: BackendKind,
  allowFallback: boolean
): BackendKind => {
  if (capabilities.availableBackends.includes(preferred)) {
    return preferred;
  }
  if (!allowFallback) {
    return preferred;
  }
  if (capabilities.availableBackends.includes('webgpu')) {
    return 'webgpu';
  }
  if (capabilities.availableBackends.includes('webgl2')) {
    return 'webgl2';
  }
  return 'mock';
};
