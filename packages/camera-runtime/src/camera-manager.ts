import type { CameraConstraints } from './constraints.js';
import type { CameraState, CameraSnapshot } from './state.js';
import { freezeSnapshot } from './state.js';
import type { CameraClock } from './types.js';

/**
 * Low-level pose mutation helper used by CameraManager.
 */
export class CameraController {
  private revision = 0;

  public constructor(
    private readonly constraints: CameraConstraints,
    private readonly clock: CameraClock
  ) {}

  public getRevision(): number {
    return this.revision;
  }

  public commit(state: CameraState): {
    readonly state: CameraState;
    readonly snapshot: CameraSnapshot;
    readonly violations: readonly string[];
  } {
    const applied = this.constraints.apply(state);
    this.revision += 1;
    const snapshot = freezeSnapshot(applied.state, this.revision, this.clock.now());
    return {
      state: applied.state,
      snapshot,
      violations: applied.violations
    };
  }
}

/**
 * Owns working camera state and publishes immutable snapshots.
 */
export class CameraManager {
  private state: CameraState;
  private snapshot: CameraSnapshot;
  private readonly controller: CameraController;

  public constructor(
    initial: CameraState,
    constraints: CameraConstraints,
    clock: CameraClock
  ) {
    this.controller = new CameraController(constraints, clock);
    const committed = this.controller.commit(initial);
    this.state = committed.state;
    this.snapshot = committed.snapshot;
  }

  public getState(): CameraState {
    return {
      ...this.state,
      eye: { ...this.state.eye },
      target: { ...this.state.target },
      up: { ...this.state.up },
      viewportSize: { ...this.state.viewportSize }
    };
  }

  public getSnapshot(): CameraSnapshot {
    return this.snapshot;
  }

  public apply(next: CameraState): {
    readonly snapshot: CameraSnapshot;
    readonly violations: readonly string[];
  } {
    const committed = this.controller.commit(next);
    this.state = committed.state;
    this.snapshot = committed.snapshot;
    return { snapshot: this.snapshot, violations: committed.violations };
  }
}
