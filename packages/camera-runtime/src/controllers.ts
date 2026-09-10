import { add, fromSpherical, scale, toSpherical, viewBasis, aabbCenter, aabbRadius } from './math.js';
import type { CameraState } from './state.js';
import type { Aabb } from './types.js';
import { cameraSuccess, type CameraResult } from './types.js';

/**
 * Orbit around target (yaw / pitch deltas in radians).
 * Constraints are applied by CameraManager on commit — not here.
 */
export class OrbitController {
  public orbit(
    state: CameraState,
    deltaYaw: number,
    deltaPitch: number
  ): CameraResult<CameraState> {
    const spherical = toSpherical(state.eye, state.target);
    const nextEye = fromSpherical(state.target, {
      yaw: spherical.yaw + deltaYaw,
      pitch: spherical.pitch + deltaPitch,
      radius: spherical.radius
    });
    return cameraSuccess({
      ...state,
      eye: nextEye
    });
  }
}

/**
 * Pan eye+target in the view plane (screen-space deltas scaled by distance).
 */
export class PanController {
  public pan(
    state: CameraState,
    deltaX: number,
    deltaY: number
  ): CameraResult<CameraState> {
    const basis = viewBasis(state.eye, state.target, state.up);
    const spherical = toSpherical(state.eye, state.target);
    const scaleFactor =
      state.projection === 'orthographic'
        ? state.orthoSize * 0.002
        : spherical.radius * 0.002;
    const offset = add(
      scale(basis.right, -deltaX * scaleFactor),
      scale(basis.up, deltaY * scaleFactor)
    );
    return cameraSuccess({
      ...state,
      eye: add(state.eye, offset),
      target: add(state.target, offset)
    });
  }
}

/**
 * Zoom by changing distance (perspective) or ortho size.
 */
export class ZoomController {
  public zoom(state: CameraState, factor: number): CameraResult<CameraState> {
    const safeFactor = factor <= 0 ? 1 : factor;
    if (state.projection === 'orthographic') {
      return cameraSuccess({
        ...state,
        orthoSize: state.orthoSize * safeFactor
      });
    }
    const spherical = toSpherical(state.eye, state.target);
    const nextEye = fromSpherical(state.target, {
      yaw: spherical.yaw,
      pitch: spherical.pitch,
      radius: spherical.radius * safeFactor
    });
    return cameraSuccess({
      ...state,
      eye: nextEye
    });
  }
}

/**
 * Fit view to an AABB. Fit Selection is the same API with caller-supplied bounds
 * (no selection logic in this package).
 */
export class FitViewController {
  public fitAll(state: CameraState, bounds: Aabb, padding = 1.2): CameraResult<CameraState> {
    return this.fitBounds(state, bounds, padding);
  }

  /**
   * Fit Selection API — consumers pass selection bounds; Camera Runtime does not select.
   */
  public fitSelection(
    state: CameraState,
    selectionBounds: Aabb,
    padding = 1.2
  ): CameraResult<CameraState> {
    return this.fitBounds(state, selectionBounds, padding);
  }

  private fitBounds(
    state: CameraState,
    bounds: Aabb,
    padding: number
  ): CameraResult<CameraState> {
    const center = aabbCenter(bounds);
    const radius = Math.max(1e-4, aabbRadius(bounds) * padding);
    const spherical = toSpherical(state.eye, state.target);
    if (state.projection === 'orthographic') {
      return cameraSuccess({
        ...state,
        target: center,
        eye: fromSpherical(center, {
          yaw: spherical.yaw,
          pitch: spherical.pitch,
          radius: Math.max(radius * 2, spherical.radius)
        }),
        orthoSize: radius
      });
    }
    const fovRad = (state.fovDegrees * Math.PI) / 180;
    const distance = radius / Math.tan(fovRad * 0.5);
    return cameraSuccess({
      ...state,
      target: center,
      eye: fromSpherical(center, {
        yaw: spherical.yaw,
        pitch: spherical.pitch,
        radius: Math.max(distance, 0.1)
      })
    });
  }
}
