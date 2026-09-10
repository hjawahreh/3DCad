import { lerp } from './math.js';
import type { CameraSnapshot, CameraState } from './state.js';
import { cloneState, freezeSnapshot } from './state.js';
import type { CameraClock } from './types.js';
import { cameraFailure, cameraSuccess, type CameraResult } from './types.js';

export interface CameraAnimation {
  readonly from: CameraSnapshot;
  readonly to: CameraSnapshot;
  readonly durationMs: number;
  readonly startedAt: number;
}

/**
 * Smooth camera interpolation between snapshots.
 * Reserved cinematic contracts are not implemented here.
 */
export class CameraAnimationManager {
  private active: CameraAnimation | undefined;

  public constructor(private readonly clock: CameraClock) {}

  public start(
    from: CameraSnapshot,
    to: CameraSnapshot,
    durationMs: number
  ): CameraResult<CameraAnimation> {
    if (durationMs <= 0) {
      return cameraFailure('validation', 'Animation duration must be positive');
    }
    this.active = Object.freeze({
      from,
      to,
      durationMs,
      startedAt: this.clock.now()
    });
    return cameraSuccess(this.active);
  }

  public isActive(): boolean {
    return this.active !== undefined;
  }

  public cancel(): void {
    this.active = undefined;
  }

  public tick(): CameraResult<{
    readonly state: CameraState;
    readonly snapshot: CameraSnapshot;
    readonly completed: boolean;
    readonly t: number;
  }> {
    if (this.active === undefined) {
      return cameraFailure('not-found', 'No active animation');
    }
    const now = this.clock.now();
    const elapsed = now - this.active.startedAt;
    const t = Math.min(1, elapsed / this.active.durationMs);
    const eased = t * t * (3 - 2 * t); // smoothstep
    const from = this.active.from;
    const to = this.active.to;
    const state: CameraState = {
      eye: lerp(from.eye, to.eye, eased),
      target: lerp(from.target, to.target, eased),
      up: lerp(from.up, to.up, eased),
      projection: eased < 0.5 ? from.projection : to.projection,
      fovDegrees: from.fovDegrees + (to.fovDegrees - from.fovDegrees) * eased,
      near: from.near + (to.near - from.near) * eased,
      far: from.far + (to.far - from.far) * eased,
      orthoSize: from.orthoSize + (to.orthoSize - from.orthoSize) * eased,
      aspect: to.aspect,
      viewportSize: { ...to.viewportSize }
    };
    const completed = t >= 1;
    if (completed) {
      this.active = undefined;
    }
    const snapshot = freezeSnapshot(state, to.revision, now);
    return cameraSuccess({ state, snapshot, completed, t: eased });
  }

  public getActive(): CameraAnimation | undefined {
    return this.active;
  }
}

export { cloneState };
