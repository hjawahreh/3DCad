import type { GpuCapabilities, ResolvedRendererConfig } from '../config.js';
import { selectBackend } from '../capability/detect.js';
import type { BackendKind } from '../types.js';
import type { GpuBackend } from './types.js';
import { MockGpuBackend } from './mock-backend.js';
import { WebGl2Backend } from './webgl2-backend.js';
import { WebGpuBackend } from './webgpu-backend.js';

export type {
  BufferCreateInfo,
  BufferUsage,
  CommandBufferStats,
  GpuBackend,
  GpuBackendStats,
  PipelineCreateInfo,
  RenderTargetCreateInfo,
  TextureCreateInfo,
  TextureFormat
} from './types.js';

export { MockGpuBackend } from './mock-backend.js';
export { WebGl2Backend } from './webgl2-backend.js';
export { WebGpuBackend } from './webgpu-backend.js';

export const createGpuBackend = (
  capabilities: GpuCapabilities,
  config: ResolvedRendererConfig,
  forceKind?: BackendKind
): GpuBackend => {
  const kind =
    forceKind ??
    selectBackend(capabilities, config.preferredBackend, config.allowFallback);

  switch (kind) {
    case 'webgpu':
      return new WebGpuBackend(capabilities, config);
    case 'webgl2':
      return new WebGl2Backend(capabilities, config);
    case 'mock':
    default:
      return new MockGpuBackend(capabilities, config);
  }
};
