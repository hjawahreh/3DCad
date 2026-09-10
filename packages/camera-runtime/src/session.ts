import type { InteractionSessionId } from '@cad-studio/interaction-runtime';
import type { ViewportId } from '@cad-studio/viewport-runtime';
import { CameraAnimationManager } from './animation.js';
import { CameraManager } from './camera-manager.js';
import type { CameraConfiguration } from './configuration.js';
import { resolveCameraConfiguration } from './configuration.js';
import { CameraConstraints } from './constraints.js';
import type { CameraContext } from './context.js';
import { CameraDiagnostics } from './diagnostics.js';
import { CameraEvents } from './events.js';
import { CameraLifecycle } from './lifecycle.js';
import { CameraMetrics } from './metrics.js';
import { NavigationCoordinator } from './navigation.js';
import { ProjectionManager } from './projection-manager.js';
import type { CameraPublicState, CameraSnapshot, CameraState } from './state.js';
import { ViewManager } from './view-manager.js';
import {
  createDefaultCameraClock,
  type Aabb,
  type CameraClock,
  type CameraSessionId,
  type PresetView,
  type ProjectionMode,
  type Size2D,
  cameraFailure,
  cameraSuccess,
  type CameraResult
} from './types.js';

export interface CameraSessionOptions {
  readonly sessionId: CameraSessionId;
  readonly viewportId?: ViewportId;
  readonly interactionSessionId?: InteractionSessionId;
  readonly configuration?: Partial<CameraConfiguration>;
  readonly clock?: CameraClock;
}

/**
 * One camera session per viewport (typically).
 * Owns camera lifecycle, navigation, projection, and sync.
 *
 * Ownership: runtime-owned until dispose.
 * Threading: single-owner; do not call concurrently.
 * Does not render, select, pick, or mutate Scene.
 */
export class CameraSession {
  public readonly sessionId: CameraSessionId;
  public readonly viewportId: ViewportId | undefined;
  public readonly interactionSessionId: InteractionSessionId | undefined;

  private readonly configuration: CameraConfiguration;
  private readonly clock: CameraClock;
  private readonly lifecycle = new CameraLifecycle();
  private readonly events = new CameraEvents();
  private readonly metrics = new CameraMetrics();
  private readonly diagnostics = new CameraDiagnostics();
  private readonly constraints: CameraConstraints;
  private readonly projection: ProjectionManager;
  private readonly views: ViewManager;
  private readonly navigation: NavigationCoordinator;
  private readonly animation: CameraAnimationManager;
  private readonly manager: CameraManager;
  private viewportAttached = false;
  private signal: AbortSignal | undefined;

  public constructor(options: CameraSessionOptions) {
    this.sessionId = options.sessionId;
    this.viewportId = options.viewportId;
    this.interactionSessionId = options.interactionSessionId;
    this.configuration = resolveCameraConfiguration(options.configuration);
    this.clock = options.clock ?? createDefaultCameraClock();
    this.constraints = new CameraConstraints(this.configuration.constraints);
    this.projection = new ProjectionManager(this.constraints);
    this.views = new ViewManager(this.constraints, {
      eye: this.configuration.eye,
      target: this.configuration.target,
      up: this.configuration.up,
      fovDegrees: this.configuration.fovDegrees,
      orthoSize: this.configuration.orthoSize
    });
    this.navigation = new NavigationCoordinator(this.views);
    this.animation = new CameraAnimationManager(this.clock);
    const initial: CameraState = {
      eye: { ...this.configuration.eye },
      target: { ...this.configuration.target },
      up: { ...this.configuration.up },
      projection: this.configuration.preferredProjection,
      fovDegrees: this.configuration.fovDegrees,
      near: this.configuration.near,
      far: this.configuration.far,
      orthoSize: this.configuration.orthoSize,
      aspect: 1,
      viewportSize: { width: 1, height: 1 }
    };
    this.manager = new CameraManager(initial, this.constraints, this.clock);
  }

  public getLifecyclePhase(): string {
    return this.lifecycle.getPhase();
  }

  public getEvents(): CameraEvents {
    return this.events;
  }

  public getMetrics(): CameraMetrics {
    return this.metrics;
  }

  public getDiagnostics(): CameraDiagnostics {
    return this.diagnostics;
  }

  public getSnapshot(): CameraSnapshot {
    return this.manager.getSnapshot();
  }

  public getNavigation(): NavigationCoordinator {
    return this.navigation;
  }

  public getContext(): CameraContext {
    return {
      sessionId: this.sessionId,
      viewportId: this.viewportId,
      interactionSessionId: this.interactionSessionId,
      configuration: this.configuration,
      clock: this.clock,
      events: this.events,
      signal: this.signal
    };
  }

  public getPublicState(): CameraPublicState {
    return Object.freeze({
      phase: this.lifecycle.getPhase(),
      snapshot: this.manager.getSnapshot(),
      animating: this.animation.isActive(),
      viewportAttached: this.viewportAttached
    });
  }

  public initialize(signal?: AbortSignal): CameraResult<void> {
    this.signal = signal;
    if (!this.lifecycle.transition('initializing')) {
      return cameraFailure('lifecycle', `Cannot initialize from ${this.lifecycle.getPhase()}`);
    }
    if (!this.lifecycle.transition('initialized')) {
      return cameraFailure('lifecycle', 'Failed to reach initialized');
    }
    this.emitLifecycle();
    return cameraSuccess(undefined);
  }

  public configure(): CameraResult<CameraConfiguration> {
    if (!this.lifecycle.transition('configuring')) {
      return cameraFailure('lifecycle', `Cannot configure from ${this.lifecycle.getPhase()}`);
    }
    this.emitLifecycle();
    if (!this.lifecycle.transition('configured')) {
      return cameraFailure('lifecycle', 'Failed to reach configured');
    }
    this.emitLifecycle();
    return cameraSuccess(this.configuration);
  }

  public attachViewport(size?: Size2D): CameraResult<CameraSnapshot> {
    if (!this.lifecycle.transition('attaching')) {
      return cameraFailure('lifecycle', `Cannot attach from ${this.lifecycle.getPhase()}`);
    }
    this.emitLifecycle();
    this.viewportAttached = true;
    if (!this.lifecycle.transition('attached')) {
      return cameraFailure('lifecycle', 'Failed to reach attached');
    }
    this.emitLifecycle();
    if (size !== undefined) {
      const synced = this.synchronize(size);
      if (!synced.ok) {
        return synced;
      }
    }
    if (!this.lifecycle.transition('ready') && this.lifecycle.getPhase() !== 'ready') {
      this.lifecycle.force('ready');
    }
    this.emitLifecycle();
    return cameraSuccess(this.manager.getSnapshot());
  }

  public synchronize(size: Size2D): CameraResult<CameraSnapshot> {
    if (this.signal?.aborted === true) {
      return cameraFailure('cancelled', 'Camera session cancelled');
    }
    const prior = this.lifecycle.getPhase();
    if (
      prior === 'attached' ||
      prior === 'ready' ||
      prior === 'navigating' ||
      prior === 'animating'
    ) {
      this.lifecycle.transition('synchronizing');
    }
    const started = this.clock.now();
    const result = this.projection.synchronizeViewport(this.manager.getState(), size);
    if (!result.ok) {
      this.diagnostics.recordSyncFailure(result.error.message, this.clock.now());
      if (this.lifecycle.getPhase() === 'synchronizing') {
        this.lifecycle.force(prior === 'attached' ? 'ready' : prior);
      }
      return result;
    }
    const applied = this.commit(result.value, 'sync');
    this.metrics.recordSync();
    this.metrics.recordUpdate(this.clock.now() - started);
    this.events.emit({
      type: 'sync',
      size: Object.freeze({ ...size }),
      snapshot: applied,
      at: this.clock.now()
    });
    if (this.lifecycle.getPhase() === 'synchronizing') {
      this.lifecycle.force(
        prior === 'attached' || prior === 'synchronizing' ? 'ready' : prior
      );
    }
    return cameraSuccess(applied);
  }

  public setProjection(mode: ProjectionMode): CameraResult<CameraSnapshot> {
    if (!this.ensureInteractive()) {
      return cameraFailure('lifecycle', `Cannot switch projection in ${this.lifecycle.getPhase()}`);
    }
    const result = this.projection.setProjection(this.manager.getState(), mode);
    if (!result.ok) {
      this.diagnostics.recordProjectionError(result.error.message, this.clock.now());
      return result;
    }
    const snapshot = this.commit(result.value, 'projection');
    this.metrics.recordProjectionSwitch();
    this.events.emit({
      type: 'projection',
      projection: mode,
      snapshot,
      at: this.clock.now()
    });
    return cameraSuccess(snapshot);
  }

  public orbit(deltaYaw: number, deltaPitch: number): CameraResult<CameraSnapshot> {
    return this.runNavigation('orbit', { mode: 'orbit', deltaYaw, deltaPitch });
  }

  public pan(deltaX: number, deltaY: number): CameraResult<CameraSnapshot> {
    return this.runNavigation('pan', { mode: 'pan', deltaX, deltaY });
  }

  public zoom(factor: number): CameraResult<CameraSnapshot> {
    return this.runNavigation('zoom', { mode: 'zoom', factor });
  }

  public fitAll(bounds: Aabb, padding?: number): CameraResult<CameraSnapshot> {
    return this.runNavigation('fit', {
      mode: 'fit-all',
      bounds,
      ...(padding === undefined ? {} : { padding })
    });
  }

  /** Fit Selection API — caller supplies bounds; no selection logic here. */
  public fitSelection(selectionBounds: Aabb, padding?: number): CameraResult<CameraSnapshot> {
    return this.runNavigation('fit', {
      mode: 'fit-selection',
      bounds: selectionBounds,
      ...(padding === undefined ? {} : { padding })
    });
  }

  public resetView(): CameraResult<CameraSnapshot> {
    return this.runNavigation('reset', { mode: 'reset' });
  }

  public presetView(preset: PresetView): CameraResult<CameraSnapshot> {
    return this.runNavigation('preset', { mode: 'preset', preset });
  }

  public animateTo(
    target: CameraSnapshot,
    durationMs?: number
  ): CameraResult<CameraSnapshot> {
    if (!this.ensureInteractive()) {
      return cameraFailure('lifecycle', `Cannot animate in ${this.lifecycle.getPhase()}`);
    }
    const duration = durationMs ?? this.configuration.animationDurationMs;
    const started = this.animation.start(this.manager.getSnapshot(), target, duration);
    if (!started.ok) {
      return started;
    }
    this.lifecycle.force('animating');
    this.emitLifecycle();
    this.metrics.recordAnimation(duration);
    this.events.emit({
      type: 'animation',
      phase: 'started',
      snapshot: this.manager.getSnapshot(),
      at: this.clock.now()
    });
    return cameraSuccess(this.manager.getSnapshot());
  }

  public tickAnimation(): CameraResult<{
    readonly snapshot: CameraSnapshot;
    readonly completed: boolean;
  }> {
    const tick = this.animation.tick();
    if (!tick.ok) {
      return tick;
    }
    const applied = this.manager.apply(tick.value.state);
    this.reportViolations(applied.violations);
    this.events.emit({
      type: 'animation',
      phase: tick.value.completed ? 'completed' : 'updated',
      snapshot: applied.snapshot,
      at: this.clock.now()
    });
    if (tick.value.completed) {
      this.lifecycle.force('ready');
      this.emitLifecycle();
    }
    return cameraSuccess({
      snapshot: applied.snapshot,
      completed: tick.value.completed
    });
  }

  public cancelAnimation(): CameraResult<void> {
    if (!this.animation.isActive()) {
      return cameraSuccess(undefined);
    }
    this.animation.cancel();
    this.events.emit({
      type: 'animation',
      phase: 'cancelled',
      snapshot: this.manager.getSnapshot(),
      at: this.clock.now()
    });
    this.lifecycle.force('ready');
    return cameraSuccess(undefined);
  }

  public pause(): CameraResult<void> {
    if (this.lifecycle.getPhase() === 'paused') {
      return cameraSuccess(undefined);
    }
    if (!this.lifecycle.transition('paused')) {
      return cameraFailure('lifecycle', `Cannot pause from ${this.lifecycle.getPhase()}`);
    }
    this.animation.cancel();
    this.emitLifecycle();
    return cameraSuccess(undefined);
  }

  public resume(): CameraResult<void> {
    if (this.lifecycle.getPhase() === 'ready') {
      return cameraSuccess(undefined);
    }
    if (!this.lifecycle.transition('ready')) {
      return cameraFailure('lifecycle', `Cannot resume from ${this.lifecycle.getPhase()}`);
    }
    this.emitLifecycle();
    return cameraSuccess(undefined);
  }

  public detachViewport(): CameraResult<void> {
    if (!this.lifecycle.transition('detaching') && this.lifecycle.getPhase() !== 'detached') {
      if (this.lifecycle.getPhase() === 'detached') {
        return cameraSuccess(undefined);
      }
      this.lifecycle.force('detaching');
    }
    this.emitLifecycle();
    this.viewportAttached = false;
    this.lifecycle.force('detached');
    this.emitLifecycle();
    return cameraSuccess(undefined);
  }

  public shutdown(): CameraResult<void> {
    if (this.lifecycle.isTerminal()) {
      return cameraSuccess(undefined);
    }
    this.animation.cancel();
    this.lifecycle.force('shutting-down');
    this.emitLifecycle();
    this.viewportAttached = false;
    this.lifecycle.force('shutdown');
    this.emitLifecycle();
    return cameraSuccess(undefined);
  }

  public dispose(): CameraResult<void> {
    this.shutdown();
    this.events.clear();
    this.diagnostics.clear();
    this.lifecycle.force('disposed');
    this.emitLifecycle();
    return cameraSuccess(undefined);
  }

  private runNavigation(
    eventMode: 'orbit' | 'pan' | 'zoom' | 'fit' | 'reset' | 'preset',
    command: Parameters<NavigationCoordinator['navigate']>[1]
  ): CameraResult<CameraSnapshot> {
    if (!this.ensureInteractive()) {
      return cameraFailure('lifecycle', `Cannot navigate in ${this.lifecycle.getPhase()}`);
    }
    if (this.signal?.aborted === true) {
      return cameraFailure('cancelled', 'Camera session cancelled');
    }
    this.lifecycle.force('navigating');
    const started = this.clock.now();
    const result = this.navigation.navigate(this.manager.getState(), command);
    if (!result.ok) {
      this.diagnostics.recordInvalidState(result.error.message, this.clock.now());
      this.lifecycle.force('ready');
      return result;
    }
    const snapshot = this.commit(result.value, eventMode);
    this.metrics.recordNavigation(command.mode);
    this.metrics.recordUpdate(this.clock.now() - started);
    this.events.emit({
      type: 'navigate',
      mode: eventMode,
      snapshot,
      at: this.clock.now()
    });
    this.lifecycle.force('ready');
    return cameraSuccess(snapshot);
  }

  private commit(state: CameraState, _reason: string): CameraSnapshot {
    const applied = this.manager.apply(state);
    this.reportViolations(applied.violations);
    const valid = this.constraints.validateProjection(this.manager.getState());
    if (!valid.ok) {
      this.diagnostics.recordProjectionError(valid.error.message, this.clock.now());
    }
    return applied.snapshot;
  }

  private reportViolations(violations: readonly string[]): void {
    for (const code of violations) {
      this.diagnostics.recordConstraintViolation(code, this.clock.now());
      this.events.emit({
        type: 'constraint',
        code,
        message: `Constraint applied: ${code}`,
        at: this.clock.now()
      });
    }
  }

  private ensureInteractive(): boolean {
    const phase = this.lifecycle.getPhase();
    return (
      phase === 'ready' ||
      phase === 'navigating' ||
      phase === 'animating' ||
      phase === 'attached'
    );
  }

  private emitLifecycle(): void {
    this.events.emit({
      type: 'lifecycle',
      phase: this.lifecycle.getPhase(),
      at: this.clock.now()
    });
  }
}
