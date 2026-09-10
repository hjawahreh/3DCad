import { toSpherical } from './math.js';
import type { CameraConstraints } from './constraints.js';
import type { CameraState } from './state.js';
import type { PresetView, Vec3 } from './types.js';
import { UNIT_Y, vec3 } from './types.js';
import { cameraSuccess, type CameraResult } from './types.js';

const PRESET_OFFSETS: Readonly<Record<PresetView, Vec3>> = Object.freeze({
  front: vec3(0, 0, 1),
  back: vec3(0, 0, -1),
  left: vec3(-1, 0, 0),
  right: vec3(1, 0, 0),
  top: vec3(0, 1, 0),
  bottom: vec3(0, -1, 0),
  iso: vec3(1, 1, 1)
});

/**
 * Preset views and reset-to-default pose.
 */
export class ViewManager {
  public constructor(
    private readonly constraints: CameraConstraints,
    private readonly defaults: {
      readonly eye: Vec3;
      readonly target: Vec3;
      readonly up: Vec3;
      readonly fovDegrees: number;
      readonly orthoSize: number;
    }
  ) {}

  public reset(state: CameraState): CameraResult<CameraState> {
    const next: CameraState = {
      ...state,
      eye: { ...this.defaults.eye },
      target: { ...this.defaults.target },
      up: { ...this.defaults.up },
      fovDegrees: this.defaults.fovDegrees,
      orthoSize: this.defaults.orthoSize
    };
    return cameraSuccess(this.constraints.apply(next).state);
  }

  public applyPreset(state: CameraState, preset: PresetView): CameraResult<CameraState> {
    const spherical = toSpherical(state.eye, state.target);
    const offset = PRESET_OFFSETS[preset];
    const len = Math.hypot(offset.x, offset.y, offset.z) || 1;
    const dir = vec3(offset.x / len, offset.y / len, offset.z / len);
    const eye = vec3(
      state.target.x + dir.x * spherical.radius,
      state.target.y + dir.y * spherical.radius,
      state.target.z + dir.z * spherical.radius
    );
    const up =
      preset === 'top' || preset === 'bottom' ? vec3(0, 0, preset === 'top' ? -1 : 1) : UNIT_Y;
    const next: CameraState = {
      ...state,
      eye,
      up
    };
    return cameraSuccess(this.constraints.apply(next).state);
  }
}
