import type { ProjectionMode, Vec3 } from './types.js';
import { UNIT_Y, vec3 } from './types.js';

export interface CameraConstraintsConfig {
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly minOrthoSize: number;
  readonly maxOrthoSize: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly minFovDeg: number;
  readonly maxFovDeg: number;
  readonly panExtent: number | undefined;
}

export interface CameraConfiguration {
  readonly preferredProjection: ProjectionMode;
  readonly fovDegrees: number;
  readonly near: number;
  readonly far: number;
  readonly orthoSize: number;
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly animationDurationMs: number;
  readonly constraints: CameraConstraintsConfig;
}

export const DEFAULT_CAMERA_CONFIGURATION: CameraConfiguration = Object.freeze({
  preferredProjection: 'perspective',
  fovDegrees: 50,
  near: 0.01,
  far: 10000,
  orthoSize: 50,
  eye: vec3(2, 2, 2),
  target: vec3(0, 0, 0),
  up: UNIT_Y,
  animationDurationMs: 250,
  constraints: Object.freeze({
    minDistance: 0.05,
    maxDistance: 5000,
    minOrthoSize: 0.01,
    maxOrthoSize: 5000,
    minPitch: -Math.PI / 2 + 0.01,
    maxPitch: Math.PI / 2 - 0.01,
    minFovDeg: 10,
    maxFovDeg: 120,
    panExtent: undefined
  })
});

export const resolveCameraConfiguration = (
  partial: Partial<CameraConfiguration> = {}
): CameraConfiguration =>
  Object.freeze({
    preferredProjection:
      partial.preferredProjection ?? DEFAULT_CAMERA_CONFIGURATION.preferredProjection,
    fovDegrees: partial.fovDegrees ?? DEFAULT_CAMERA_CONFIGURATION.fovDegrees,
    near: partial.near ?? DEFAULT_CAMERA_CONFIGURATION.near,
    far: partial.far ?? DEFAULT_CAMERA_CONFIGURATION.far,
    orthoSize: partial.orthoSize ?? DEFAULT_CAMERA_CONFIGURATION.orthoSize,
    eye: partial.eye ?? DEFAULT_CAMERA_CONFIGURATION.eye,
    target: partial.target ?? DEFAULT_CAMERA_CONFIGURATION.target,
    up: partial.up ?? DEFAULT_CAMERA_CONFIGURATION.up,
    animationDurationMs:
      partial.animationDurationMs ?? DEFAULT_CAMERA_CONFIGURATION.animationDurationMs,
    constraints: Object.freeze({
      ...DEFAULT_CAMERA_CONFIGURATION.constraints,
      ...(partial.constraints ?? {})
    })
  });
