export {
  DEFAULT_RENDERER_CONFIG,
  resolveRendererConfig,
  type GpuCapabilities,
  type GpuFeatureFlags,
  type GpuLimits,
  type RendererConfig,
  type ResolvedRendererConfig
} from '../config.js';
export {
  detectGpuCapabilities,
  selectBackend,
  type CapabilityProbeOptions
} from './detect.js';
