export type {
  Brand,
  DevicePixelInfo,
  FrameClock,
  FrameNumber,
  RenderMode,
  Size2D,
  ViewportBackendKind,
  ViewportCanvasElement,
  ViewportError,
  ViewportErrorCode,
  ViewportId,
  ViewportResult,
  ViewportSessionId
} from './types.js';
export {
  asFrameNumber,
  asViewportId,
  asViewportSessionId,
  createDefaultFrameClock,
  viewportFailure,
  viewportSuccess
} from './types.js';

export type { ViewportConfiguration } from './configuration.js';
export {
  DEFAULT_VIEWPORT_CONFIGURATION,
  resolveViewportConfiguration
} from './configuration.js';

export type { ViewportLifecyclePhase } from './lifecycle.js';
export { ViewportLifecycle } from './lifecycle.js';

export type {
  ViewportBackendState,
  ViewportFrameState,
  ViewportPresentationState,
  ViewportRuntimePhase,
  ViewportState
} from './state.js';
export { emptyViewportState } from './state.js';

export type {
  ViewportBackendEvent,
  ViewportContextEvent,
  ViewportErrorEvent,
  ViewportEvent,
  ViewportEventListener,
  ViewportEventType,
  ViewportFrameEvent,
  ViewportInvalidateEvent,
  ViewportLifecycleEvent,
  ViewportResizeEvent,
  ViewportWarningEvent
} from './events.js';
export { ViewportEvents } from './events.js';

export type { ViewportContext } from './context.js';

export type { ViewportMetricsSnapshot } from './metrics.js';
export { ViewportMetrics } from './metrics.js';

export type {
  ViewportDiagnostic,
  ViewportDiagnosticSeverity,
  ViewportDiagnosticsSnapshot
} from './diagnostics.js';
export { ViewportDiagnostics } from './diagnostics.js';

export type {
  CanvasContextListener,
  CanvasResizeListener,
  CanvasVisibilityListener
} from './canvas-host.js';
export { CanvasHost } from './canvas-host.js';

export { ViewportResizeManager } from './resize-manager.js';
export { FrameInvalidation } from './frame-invalidation.js';
export { FrameLimiter } from './frame-limiter.js';
export type { FrameSchedulerCallback } from './frame-scheduler.js';
export { FrameScheduler } from './frame-scheduler.js';
export { PresentationScheduler } from './presentation-scheduler.js';
export { RenderSurface } from './render-surface.js';

export type {
  BackendSelectionResult,
  DeviceCapabilityRecord
} from './device-capability.js';
export {
  BackendSelection,
  DeviceCapabilityRegistry
} from './device-capability.js';

export { SceneBridge } from './scene-bridge.js';
export type { RendererSubmitResult } from './renderer-bridge.js';
export { RendererBridge, RendererHost } from './renderer-bridge.js';

export type { ResourceKind, TrackedResource } from './resource-lifecycle.js';
export { ResourceLifecycle } from './resource-lifecycle.js';

export type { OperationOverlayDescriptor } from './operation-overlay-host.js';
export { OperationOverlayHost } from './operation-overlay-host.js';

export type { PerformanceSample } from './performance-monitor.js';
export { PerformanceMonitor } from './performance-monitor.js';

export type { RecoveryAction } from './error-boundary.js';
export { ErrorBoundary, RecoveryCoordinator } from './error-boundary.js';

export type { FrameCoordinatorDeps, FrameResult } from './frame-coordinator.js';
export { FrameCoordinator } from './frame-coordinator.js';
export { RenderLoop } from './render-loop.js';

export { ViewportBootstrap } from './bootstrap.js';
export { ViewportShutdown } from './shutdown.js';

export type { ViewportSessionOptions } from './session.js';
export { ViewportSession } from './session.js';

export { ViewportHost, ViewportRegistry } from './host.js';

export type { ViewportRuntimeOptions } from './runtime.js';
export { ViewportRuntime } from './runtime.js';
