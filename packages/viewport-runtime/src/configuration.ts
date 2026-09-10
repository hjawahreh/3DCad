import type { ViewportBackendKind, RenderMode, Size2D } from './types.js';

/**
 * Immutable viewport configuration.
 * Ownership: copied into session at configure; later changes require reconfigure.
 */
export interface ViewportConfiguration {
  readonly preferredBackend: ViewportBackendKind;
  readonly allowBackendFallback: boolean;
  readonly allowMockBackend: boolean;
  readonly renderMode: RenderMode;
  readonly targetFps: number;
  readonly idleFps: number;
  readonly maxPendingInvalidations: number;
  readonly clearColor: readonly [number, number, number, number];
  readonly initialSize: Size2D;
  readonly respectDevicePixelRatio: boolean;
  readonly startupBudgetMs: number;
}

export const DEFAULT_VIEWPORT_CONFIGURATION: ViewportConfiguration = Object.freeze({
  preferredBackend: 'webgpu',
  allowBackendFallback: true,
  allowMockBackend: true,
  renderMode: 'on-demand',
  targetFps: 120,
  idleFps: 30,
  maxPendingInvalidations: 64,
  clearColor: [0.08, 0.09, 0.11, 1] as const,
  initialSize: Object.freeze({ width: 1, height: 1 }),
  respectDevicePixelRatio: true,
  startupBudgetMs: 250
});

export const resolveViewportConfiguration = (
  partial: Partial<ViewportConfiguration> = {}
): ViewportConfiguration =>
  Object.freeze({
    preferredBackend: partial.preferredBackend ?? DEFAULT_VIEWPORT_CONFIGURATION.preferredBackend,
    allowBackendFallback:
      partial.allowBackendFallback ?? DEFAULT_VIEWPORT_CONFIGURATION.allowBackendFallback,
    allowMockBackend: partial.allowMockBackend ?? DEFAULT_VIEWPORT_CONFIGURATION.allowMockBackend,
    renderMode: partial.renderMode ?? DEFAULT_VIEWPORT_CONFIGURATION.renderMode,
    targetFps: partial.targetFps ?? DEFAULT_VIEWPORT_CONFIGURATION.targetFps,
    idleFps: partial.idleFps ?? DEFAULT_VIEWPORT_CONFIGURATION.idleFps,
    maxPendingInvalidations:
      partial.maxPendingInvalidations ?? DEFAULT_VIEWPORT_CONFIGURATION.maxPendingInvalidations,
    clearColor: partial.clearColor ?? DEFAULT_VIEWPORT_CONFIGURATION.clearColor,
    initialSize: partial.initialSize ?? DEFAULT_VIEWPORT_CONFIGURATION.initialSize,
    respectDevicePixelRatio:
      partial.respectDevicePixelRatio ?? DEFAULT_VIEWPORT_CONFIGURATION.respectDevicePixelRatio,
    startupBudgetMs: partial.startupBudgetMs ?? DEFAULT_VIEWPORT_CONFIGURATION.startupBudgetMs
  });
