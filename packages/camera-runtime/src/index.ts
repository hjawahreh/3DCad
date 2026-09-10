export type {
  Aabb,
  Brand,
  CameraClock,
  CameraError,
  CameraErrorCode,
  CameraId,
  CameraResult,
  CameraRuntimeId,
  CameraSessionId,
  InteractionSessionId,
  PresetView,
  ProjectionMode,
  Size2D,
  Vec3,
  ViewportId,
  ViewportSessionId
} from './types.js';
export {
  asCameraId,
  asCameraRuntimeId,
  asCameraSessionId,
  cameraFailure,
  cameraSuccess,
  createDefaultCameraClock,
  UNIT_Y,
  UNIT_Z,
  vec3,
  ZERO
} from './types.js';

export type { CameraConfiguration, CameraConstraintsConfig } from './configuration.js';
export {
  DEFAULT_CAMERA_CONFIGURATION,
  resolveCameraConfiguration
} from './configuration.js';

export type { CameraLifecyclePhase } from './lifecycle.js';
export { CameraLifecycle } from './lifecycle.js';

export type {
  CameraPublicState,
  CameraRuntimePhase,
  CameraSnapshot,
  CameraState
} from './state.js';
export { cloneState, freezeSnapshot } from './state.js';

export type {
  CameraAnimationEvent,
  CameraConstraintEvent,
  CameraErrorEvent,
  CameraEvent,
  CameraEventListener,
  CameraEventType,
  CameraLifecycleEvent,
  CameraNavigateEvent,
  CameraProjectionEvent,
  CameraSyncEvent,
  CameraWarningEvent
} from './events.js';
export { CameraEvents } from './events.js';

export type { ConstraintApplication } from './constraints.js';
export { CameraConstraints } from './constraints.js';

export { ProjectionManager } from './projection-manager.js';
export { ViewManager } from './view-manager.js';

export {
  FitViewController,
  OrbitController,
  PanController,
  ZoomController
} from './controllers.js';

export type { NavigationMode } from './navigation.js';
export { NavigationCoordinator } from './navigation.js';

export type { CameraAnimation } from './animation.js';
export { CameraAnimationManager } from './animation.js';

export type { CameraMetricsSnapshot } from './metrics.js';
export { CameraMetrics } from './metrics.js';

export type {
  CameraDiagnostic,
  CameraDiagnosticSeverity,
  CameraDiagnosticsSnapshot
} from './diagnostics.js';
export { CameraDiagnostics } from './diagnostics.js';

export type { CameraContext } from './context.js';

export { CameraController, CameraManager } from './camera-manager.js';

export type {
  CinematicAnimationContract,
  FlyThroughNavigationContract,
  StereoCameraContract,
  VrCameraContract
} from './reserved.js';
export { RESERVED_CAMERA_CHANNELS } from './reserved.js';

export type { CameraSessionOptions } from './session.js';
export { CameraSession } from './session.js';

export { CameraRegistry } from './registry.js';

export type { CameraRuntimeOptions } from './runtime.js';
export { CameraRuntime } from './runtime.js';

export {
  aabbCenter,
  aabbRadius,
  add,
  clamp,
  cross,
  distance,
  dot,
  fromSpherical,
  length,
  lerp,
  normalize,
  scale,
  sub,
  toSpherical,
  viewBasis,
  type Spherical
} from './math.js';
