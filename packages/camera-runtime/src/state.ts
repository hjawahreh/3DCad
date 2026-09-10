import type { ProjectionMode, Size2D, Vec3 } from './types.js';
import type { CameraLifecyclePhase } from './lifecycle.js';

/**
 * Mutable working camera pose (session-owned).
 * Publish via CameraSnapshot for consumers.
 */
export interface CameraState {
  eye: Vec3;
  target: Vec3;
  up: Vec3;
  projection: ProjectionMode;
  fovDegrees: number;
  near: number;
  far: number;
  orthoSize: number;
  aspect: number;
  viewportSize: Size2D;
}

/**
 * Immutable camera snapshot for viewport synchronization / tools.
 * Ownership: value object; safe to share after publication.
 * Contains zero mutable state.
 */
export interface CameraSnapshot {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly projection: ProjectionMode;
  readonly fovDegrees: number;
  readonly near: number;
  readonly far: number;
  readonly orthoSize: number;
  readonly aspect: number;
  readonly viewportSize: Size2D;
  readonly revision: number;
  readonly createdAt: number;
}

export const freezeSnapshot = (
  state: CameraState,
  revision: number,
  createdAt: number
): CameraSnapshot =>
  Object.freeze({
    eye: Object.freeze({ ...state.eye }),
    target: Object.freeze({ ...state.target }),
    up: Object.freeze({ ...state.up }),
    projection: state.projection,
    fovDegrees: state.fovDegrees,
    near: state.near,
    far: state.far,
    orthoSize: state.orthoSize,
    aspect: state.aspect,
    viewportSize: Object.freeze({ ...state.viewportSize }),
    revision,
    createdAt
  });

export const cloneState = (snapshot: CameraSnapshot): CameraState => ({
  eye: { ...snapshot.eye },
  target: { ...snapshot.target },
  up: { ...snapshot.up },
  projection: snapshot.projection,
  fovDegrees: snapshot.fovDegrees,
  near: snapshot.near,
  far: snapshot.far,
  orthoSize: snapshot.orthoSize,
  aspect: snapshot.aspect,
  viewportSize: { ...snapshot.viewportSize }
});

export type CameraRuntimePhase = CameraLifecyclePhase;

export interface CameraPublicState {
  readonly phase: CameraRuntimePhase;
  readonly snapshot: CameraSnapshot | undefined;
  readonly animating: boolean;
  readonly viewportAttached: boolean;
}
