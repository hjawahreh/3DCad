import type { CameraConstraintsConfig } from './configuration.js';
import { clamp, distance, toSpherical, fromSpherical } from './math.js';
import type { CameraState } from './state.js';
import { cameraFailure, cameraSuccess, type CameraResult } from './types.js';
import type { Vec3 } from './types.js';

export interface ConstraintApplication {
  readonly state: CameraState;
  readonly violations: readonly string[];
}

/**
 * Enforces zoom / rotation / pan / projection constraints.
 */
export class CameraConstraints {
  public constructor(private readonly config: CameraConstraintsConfig) {}

  public apply(state: CameraState): ConstraintApplication {
    const violations: string[] = [];
    const next: CameraState = {
      ...state,
      eye: { ...state.eye },
      target: { ...state.target },
      up: { ...state.up },
      viewportSize: { ...state.viewportSize }
    };

    const spherical = toSpherical(next.eye, next.target);
    let radius = spherical.radius;
    let pitch = spherical.pitch;
    if (radius < this.config.minDistance) {
      violations.push('min-distance');
      radius = this.config.minDistance;
    }
    if (radius > this.config.maxDistance) {
      violations.push('max-distance');
      radius = this.config.maxDistance;
    }
    if (pitch < this.config.minPitch) {
      violations.push('min-pitch');
      pitch = this.config.minPitch;
    }
    if (pitch > this.config.maxPitch) {
      violations.push('max-pitch');
      pitch = this.config.maxPitch;
    }
    next.eye = fromSpherical(next.target, {
      yaw: spherical.yaw,
      pitch,
      radius
    });

    if (next.orthoSize < this.config.minOrthoSize) {
      violations.push('min-ortho');
      next.orthoSize = this.config.minOrthoSize;
    }
    if (next.orthoSize > this.config.maxOrthoSize) {
      violations.push('max-ortho');
      next.orthoSize = this.config.maxOrthoSize;
    }

    if (next.fovDegrees < this.config.minFovDeg) {
      violations.push('min-fov');
      next.fovDegrees = this.config.minFovDeg;
    }
    if (next.fovDegrees > this.config.maxFovDeg) {
      violations.push('max-fov');
      next.fovDegrees = this.config.maxFovDeg;
    }

    if (next.near <= 0 || next.far <= next.near) {
      violations.push('projection-planes');
      next.near = Math.max(1e-4, next.near);
      next.far = Math.max(next.near + 1, next.far);
    }

    if (this.config.panExtent !== undefined) {
      const extent = this.config.panExtent;
      const tx = clamp(next.target.x, -extent, extent);
      const ty = clamp(next.target.y, -extent, extent);
      const tz = clamp(next.target.z, -extent, extent);
      if (tx !== next.target.x || ty !== next.target.y || tz !== next.target.z) {
        violations.push('pan-extent');
        const dx = tx - next.target.x;
        const dy = ty - next.target.y;
        const dz = tz - next.target.z;
        next.target = { x: tx, y: ty, z: tz };
        next.eye = {
          x: next.eye.x + dx,
          y: next.eye.y + dy,
          z: next.eye.z + dz
        };
      }
    }

    return Object.freeze({ state: next, violations: Object.freeze(violations) });
  }

  public validateProjection(state: CameraState): CameraResult<void> {
    if (state.aspect <= 0) {
      return cameraFailure('projection', 'Aspect must be positive');
    }
    if (state.near <= 0 || state.far <= state.near) {
      return cameraFailure('projection', 'Invalid near/far planes');
    }
    if (state.projection === 'perspective' && state.fovDegrees <= 0) {
      return cameraFailure('projection', 'FOV must be positive');
    }
    if (state.projection === 'orthographic' && state.orthoSize <= 0) {
      return cameraFailure('projection', 'Ortho size must be positive');
    }
    return cameraSuccess(undefined);
  }

  public distanceBetween(eye: Vec3, target: Vec3): number {
    return distance(eye, target);
  }
}
