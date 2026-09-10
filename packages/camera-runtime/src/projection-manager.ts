import type { CameraConstraints } from './constraints.js';
import type { CameraState } from './state.js';
import type { ProjectionMode, Size2D } from './types.js';
import { cameraFailure, cameraSuccess, type CameraResult } from './types.js';

/**
 * Perspective / orthographic projection management and viewport resize sync.
 */
export class ProjectionManager {
  public constructor(private readonly constraints: CameraConstraints) {}

  public setProjection(
    state: CameraState,
    mode: ProjectionMode
  ): CameraResult<CameraState> {
    const next = { ...state, projection: mode };
    const applied = this.constraints.apply(next);
    const valid = this.constraints.validateProjection(applied.state);
    if (!valid.ok) {
      return valid;
    }
    return cameraSuccess(applied.state);
  }

  public synchronizeViewport(
    state: CameraState,
    size: Size2D
  ): CameraResult<CameraState> {
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    const aspect = width / height;
    const next: CameraState = {
      ...state,
      aspect,
      viewportSize: { width, height }
    };
    const applied = this.constraints.apply(next);
    const valid = this.constraints.validateProjection(applied.state);
    if (!valid.ok) {
      return cameraFailure('sync', valid.error.message, valid.error);
    }
    return cameraSuccess(applied.state);
  }
}
