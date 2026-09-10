import { failure, success, type Result } from '@cad-studio/platform-runtime';
import type { ViewportId, ViewportSessionId } from '@cad-studio/viewport-runtime';
import type { InteractionSessionId } from '@cad-studio/interaction-runtime';

export type CameraErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'validation'
  | 'lifecycle'
  | 'constraint'
  | 'projection'
  | 'sync'
  | 'unexpected';

export interface CameraError {
  readonly code: CameraErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type CameraResult<T> = Result<T, CameraError>;

export const cameraSuccess = <T>(value: T): CameraResult<T> => success(value);

export const cameraFailure = (
  code: CameraErrorCode,
  message: string,
  cause?: unknown
): CameraResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type CameraRuntimeId = Brand<string, 'CameraRuntimeId'>;
export type CameraSessionId = Brand<string, 'CameraSessionId'>;
export type CameraId = Brand<string, 'CameraId'>;

export const asCameraRuntimeId = (value: string): CameraRuntimeId => value as CameraRuntimeId;
export const asCameraSessionId = (value: string): CameraSessionId => value as CameraSessionId;
export const asCameraId = (value: string): CameraId => value as CameraId;

export type { ViewportId, ViewportSessionId, InteractionSessionId };

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Size2D {
  readonly width: number;
  readonly height: number;
}

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

export type ProjectionMode = 'perspective' | 'orthographic';

export type PresetView =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'iso';

export interface CameraClock {
  readonly now: () => number;
}

export const createDefaultCameraClock = (): CameraClock => ({
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
});

export const vec3 = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

export const ZERO = vec3(0, 0, 0);
export const UNIT_Y = vec3(0, 1, 0);
export const UNIT_Z = vec3(0, 0, 1);
