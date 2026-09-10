import { OrbitController, PanController, ZoomController, FitViewController } from './controllers.js';
import type { ViewManager } from './view-manager.js';
import type { CameraState } from './state.js';
import type { Aabb, PresetView } from './types.js';
import { cameraFailure, type CameraResult } from './types.js';

export type NavigationMode = 'orbit' | 'pan' | 'zoom' | 'fit' | 'reset' | 'preset';

/**
 * Orchestrates navigation controllers without Scene mutation.
 * Constraint enforcement happens on CameraManager commit.
 */
export class NavigationCoordinator {
  public readonly orbit: OrbitController;
  public readonly pan: PanController;
  public readonly zoom: ZoomController;
  public readonly fit: FitViewController;

  public constructor(private readonly views: ViewManager) {
    this.orbit = new OrbitController();
    this.pan = new PanController();
    this.zoom = new ZoomController();
    this.fit = new FitViewController();
  }

  public navigate(
    state: CameraState,
    command:
      | { readonly mode: 'orbit'; readonly deltaYaw: number; readonly deltaPitch: number }
      | { readonly mode: 'pan'; readonly deltaX: number; readonly deltaY: number }
      | { readonly mode: 'zoom'; readonly factor: number }
      | { readonly mode: 'fit-all'; readonly bounds: Aabb; readonly padding?: number }
      | { readonly mode: 'fit-selection'; readonly bounds: Aabb; readonly padding?: number }
      | { readonly mode: 'reset' }
      | { readonly mode: 'preset'; readonly preset: PresetView }
  ): CameraResult<CameraState> {
    switch (command.mode) {
      case 'orbit':
        return this.orbit.orbit(state, command.deltaYaw, command.deltaPitch);
      case 'pan':
        return this.pan.pan(state, command.deltaX, command.deltaY);
      case 'zoom':
        return this.zoom.zoom(state, command.factor);
      case 'fit-all':
        return this.fit.fitAll(state, command.bounds, command.padding ?? 1.2);
      case 'fit-selection':
        return this.fit.fitSelection(state, command.bounds, command.padding ?? 1.2);
      case 'reset':
        return this.views.reset(state);
      case 'preset':
        return this.views.applyPreset(state, command.preset);
      default: {
        const _never: never = command;
        return cameraFailure('invalid', `Unknown navigation command: ${String(_never)}`);
      }
    }
  }
}
