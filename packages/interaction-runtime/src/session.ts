import type { ViewportId } from '@cad-studio/viewport-runtime';
import type { InteractionConfiguration } from './configuration.js';
import { resolveInteractionConfiguration } from './configuration.js';
import type { InteractionContext } from './context.js';
import { CursorManager } from './cursor-manager.js';
import { InteractionDiagnostics } from './diagnostics.js';
import { EventDispatcher } from './event-dispatcher.js';
import { InteractionEvents, type InteractionEvent } from './events.js';
import { FocusManager } from './focus-manager.js';
import { HoverManager } from './hover-manager.js';
import { InputNormalizer } from './input-normalizer.js';
import { InteractionLifecycle } from './lifecycle.js';
import { InteractionMetrics } from './metrics.js';
import { ModifierState } from './modifier-state.js';
import { PointerCaptureManager } from './pointer-capture.js';
import type { RawPlatformInput } from './raw-input.js';
import {
  createCaptureEvent,
  createCursorEvent,
  createFocusEvent,
  createHoverEvent,
  GestureRouter,
  KeyboardRouter,
  MouseRouter,
  PointerRouter,
  WheelRouter,
  type EventFrame
} from './routers.js';
import { emptyInteractionState, type InteractionState } from './state.js';
import {
  asPointerId,
  createDefaultInteractionClock,
  type InteractionClock,
  type InteractionSessionId,
  type InteractionTargetId,
  interactionFailure,
  interactionSuccess,
  type InteractionResult,
  type PointerId
} from './types.js';

export interface InteractionSessionOptions {
  readonly sessionId: InteractionSessionId;
  readonly viewportId?: ViewportId;
  readonly configuration?: Partial<InteractionConfiguration>;
  readonly clock?: InteractionClock;
}

/**
 * One interaction session (typically bound to one viewport).
 * Pipeline: normalize → filter → modifiers → capture → hover → focus → dispatch.
 *
 * Ownership: runtime-owned until dispose.
 * Threading: single-owner; do not call concurrently.
 * Failure modes: lifecycle, validation, capture, cancelled, unavailable.
 */
export class InteractionSession {
  public readonly sessionId: InteractionSessionId;
  public readonly viewportId: ViewportId | undefined;

  private readonly configuration: InteractionConfiguration;
  private readonly clock: InteractionClock;
  private readonly lifecycle = new InteractionLifecycle();
  private readonly events = new InteractionEvents();
  private readonly metrics = new InteractionMetrics();
  private readonly diagnostics = new InteractionDiagnostics();
  private readonly normalizer = new InputNormalizer();
  private readonly modifiers = new ModifierState();
  private readonly capture = new PointerCaptureManager();
  private readonly hover = new HoverManager();
  private readonly focus = new FocusManager();
  private readonly cursors = new CursorManager();
  private readonly pointerRouter = new PointerRouter();
  private readonly mouseRouter = new MouseRouter();
  private readonly keyboardRouter = new KeyboardRouter();
  private readonly wheelRouter = new WheelRouter();
  private readonly gestureRouter = new GestureRouter();
  private readonly dispatcher: EventDispatcher;
  private readonly activePointers = new Set<number>();
  private readonly pending: RawPlatformInput[] = [];
  private signal: AbortSignal | undefined;

  public constructor(options: InteractionSessionOptions) {
    this.sessionId = options.sessionId;
    this.viewportId = options.viewportId;
    this.configuration = resolveInteractionConfiguration(options.configuration);
    this.clock = options.clock ?? createDefaultInteractionClock();
    this.dispatcher = new EventDispatcher(
      this.events,
      this.metrics,
      this.diagnostics,
      this.clock
    );
  }

  public getLifecyclePhase(): string {
    return this.lifecycle.getPhase();
  }

  public getEvents(): InteractionEvents {
    return this.events;
  }

  public getMetrics(): InteractionMetrics {
    return this.metrics;
  }

  public getDiagnostics(): InteractionDiagnostics {
    return this.diagnostics;
  }

  public getCapture(): PointerCaptureManager {
    return this.capture;
  }

  public getHover(): HoverManager {
    return this.hover;
  }

  public getFocus(): FocusManager {
    return this.focus;
  }

  public getCursors(): CursorManager {
    return this.cursors;
  }

  public getContext(): InteractionContext {
    return {
      sessionId: this.sessionId,
      viewportId: this.viewportId,
      configuration: this.configuration,
      clock: this.clock,
      events: this.events,
      signal: this.signal
    };
  }

  public getState(): InteractionState {
    return Object.freeze({
      ...emptyInteractionState(this.lifecycle.getPhase()),
      phase: this.lifecycle.getPhase(),
      modifiers: this.modifiers.snapshot(),
      focusOwner: this.focus.getOwner(),
      hoverTarget: this.hover.getTarget(),
      captureOwner: this.capture.primaryOwner(),
      capturedPointers: this.capture.capturedPointers(),
      activeCursor: this.cursors.getActive(),
      sequence: this.dispatcher.getSequence(),
      queueDepth: this.pending.length
    });
  }

  public initialize(signal?: AbortSignal): InteractionResult<void> {
    this.signal = signal;
    if (!this.lifecycle.transition('initializing')) {
      return interactionFailure(
        'lifecycle',
        `Cannot initialize from ${this.lifecycle.getPhase()}`
      );
    }
    if (!this.lifecycle.transition('ready')) {
      return interactionFailure('lifecycle', 'Failed to reach ready');
    }
    return interactionSuccess(undefined);
  }

  public activate(): InteractionResult<void> {
    if (this.lifecycle.getPhase() === 'active') {
      return interactionSuccess(undefined);
    }
    if (!this.lifecycle.transition('active')) {
      return interactionFailure(
        'lifecycle',
        `Cannot activate from ${this.lifecycle.getPhase()}`
      );
    }
    return interactionSuccess(undefined);
  }

  public pause(): InteractionResult<void> {
    if (this.lifecycle.getPhase() === 'paused') {
      return interactionSuccess(undefined);
    }
    if (!this.lifecycle.transition('paused')) {
      return interactionFailure(
        'lifecycle',
        `Cannot pause from ${this.lifecycle.getPhase()}`
      );
    }
    return interactionSuccess(undefined);
  }

  public resume(): InteractionResult<void> {
    return this.activate();
  }

  public subscribe(listener: (event: InteractionEvent) => void): () => void {
    return this.events.subscribe(listener);
  }

  /**
   * Ingest a raw platform event through the full pipeline.
   * Returns the primary dispatched event (hover/focus side-effects may also emit).
   */
  public handle(raw: RawPlatformInput): InteractionResult<readonly InteractionEvent[]> {
    if (this.signal?.aborted === true) {
      return interactionFailure('cancelled', 'Interaction session cancelled');
    }
    if (!this.lifecycle.isAcceptingInput()) {
      return interactionFailure(
        'lifecycle',
        `Session not active (phase=${this.lifecycle.getPhase()})`
      );
    }
    if (this.pending.length >= this.configuration.maxQueueDepth) {
      if (this.configuration.dropWhenFull) {
        this.diagnostics.recordLost('queue-full', this.clock.now());
        return interactionFailure('unavailable', 'Input queue full; event dropped');
      }
      return interactionFailure('unavailable', 'Input queue full');
    }

    this.pending.push(raw);
    this.dispatcher.setQueueDepth(this.pending.length);
    const emitted = this.processQueue();
    return interactionSuccess(emitted);
  }

  public capturePointer(
    pointerId: number | PointerId,
    owner: InteractionTargetId
  ): InteractionResult<InteractionEvent> {
    const result = this.capture.capture(pointerId, owner);
    if (!result.ok) {
      this.diagnostics.recordCaptureFailure(result.error.message, this.clock.now());
      return result;
    }
    const frame = this.frame();
    const event = createCaptureEvent(
      frame,
      'acquired',
      result.value.pointerId,
      result.value.owner
    );
    this.dispatcher.dispatch(event, this.clock.now());
    return interactionSuccess(event);
  }

  public releasePointer(
    pointerId: number | PointerId,
    owner: InteractionTargetId
  ): InteractionResult<InteractionEvent> {
    const result = this.capture.release(pointerId, owner);
    if (!result.ok) {
      this.diagnostics.recordCaptureFailure(result.error.message, this.clock.now());
      return result;
    }
    const frame = this.frame();
    const event = createCaptureEvent(
      frame,
      'released',
      result.value.pointerId,
      result.value.owner
    );
    this.dispatcher.dispatch(event, this.clock.now());
    return interactionSuccess(event);
  }

  public setFocus(owner: InteractionTargetId): InteractionResult<InteractionEvent> {
    const result = this.focus.focus(owner);
    if (!result.ok) {
      return result;
    }
    const frame = this.frame();
    if (result.value.previous !== undefined && result.value.previous !== owner) {
      this.dispatcher.dispatch(
        createFocusEvent(frame, 'blur', result.value.previous),
        this.clock.now()
      );
    }
    const event = createFocusEvent(frame, 'focus', owner);
    this.dispatcher.dispatch(event, this.clock.now());
    return interactionSuccess(event);
  }

  public blurFocus(expected?: InteractionTargetId): InteractionResult<InteractionEvent | undefined> {
    const result = this.focus.blur(expected);
    if (!result.ok) {
      return result;
    }
    if (result.value.previous === undefined) {
      return interactionSuccess(undefined);
    }
    const event = createFocusEvent(this.frame(), 'blur', result.value.previous);
    this.dispatcher.dispatch(event, this.clock.now());
    return interactionSuccess(event);
  }

  public setCursor(
    cursorId: string,
    owner?: InteractionTargetId
  ): InteractionResult<InteractionEvent> {
    const apply = (): ReturnType<CursorManager['setCursor']> =>
      owner === undefined
        ? this.cursors.setCursor(cursorId)
        : this.cursors.setCursor(cursorId, owner);

    let result = apply();
    if (!result.ok && result.error.code === 'not-found') {
      const registered = this.cursors.register(cursorId);
      if (!registered.ok && registered.error.code !== 'conflict') {
        return registered;
      }
      result = apply();
    }
    if (!result.ok) {
      return result;
    }
    const event = createCursorEvent(this.frame(), result.value.current, result.value.owner);
    this.dispatcher.dispatch(event, this.clock.now());
    return interactionSuccess(event);
  }

  public invalidateHover(): InteractionResult<InteractionEvent | undefined> {
    const resolution = this.hover.invalidate();
    if (resolution === undefined) {
      return interactionSuccess(undefined);
    }
    const event = createHoverEvent(
      this.frame(),
      'leave',
      resolution.position,
      undefined,
      resolution.previous
    );
    this.dispatcher.dispatch(event, this.clock.now());
    return interactionSuccess(event);
  }

  public beginFrame(): void {
    this.metrics.beginFrame();
  }

  public shutdown(): InteractionResult<void> {
    if (this.lifecycle.isTerminal()) {
      return interactionSuccess(undefined);
    }
    this.lifecycle.force('shutting-down');
    for (const lost of this.capture.clear()) {
      this.dispatcher.dispatch(
        createCaptureEvent(this.frame(), 'lost', lost.pointerId, lost.owner),
        this.clock.now()
      );
    }
    this.hover.clear();
    this.focus.clear();
    this.pending.length = 0;
    this.lifecycle.force('shutdown');
    return interactionSuccess(undefined);
  }

  public dispose(): InteractionResult<void> {
    this.shutdown();
    this.cursors.clear();
    this.modifiers.clear();
    this.events.clear();
    this.diagnostics.clear();
    this.activePointers.clear();
    this.lifecycle.force('disposed');
    return interactionSuccess(undefined);
  }

  private processQueue(): InteractionEvent[] {
    const emitted: InteractionEvent[] = [];
    while (this.pending.length > 0) {
      const raw = this.pending.shift();
      if (raw === undefined) {
        break;
      }
      this.dispatcher.setQueueDepth(this.pending.length);
      const batch = this.processOne(raw);
      emitted.push(...batch);
    }
    return emitted;
  }

  private processOne(raw: RawPlatformInput): InteractionEvent[] {
    const normalized = this.normalizer.normalize(raw);
    if (!normalized.ok) {
      this.diagnostics.recordLost(normalized.error.message, this.clock.now());
      return [];
    }

    const input = normalized.value;
    if (input.channel === 'gesture-reserved') {
      if (!this.configuration.enableReservedGesturePassThrough) {
        this.diagnostics.warn(
          'reserved-gesture',
          `Ignored reserved gesture: ${input.gestureType}`,
          this.clock.now()
        );
        return [];
      }
    }

    // Modifier resolution
    let modifiers = this.modifiers.snapshot();
    if (input.channel === 'keyboard') {
      modifiers = this.modifiers.applyKey(
        input.code.length > 0 ? input.code : input.key,
        input.phase === 'down' || input.phase === 'repeat'
      );
      // Prefer explicit modifiers from event when provided as chord snapshot
      if (
        input.modifiers.alt ||
        input.modifiers.ctrl ||
        input.modifiers.meta ||
        input.modifiers.shift
      ) {
        modifiers = this.modifiers.update(input.modifiers);
      }
    } else if ('modifiers' in input) {
      modifiers = this.modifiers.update(input.modifiers);
    }

    const receivedAt = this.clock.now();
    const frameBase = (): EventFrame =>
      Object.freeze({
        sequence: this.dispatcher.nextSequence(),
        receivedAt,
        modifiers,
        captureOwner: this.capture.primaryOwner(),
        focusOwner: this.focus.getOwner(),
        hoverTarget: this.hover.getTarget()
      });

    const out: InteractionEvent[] = [];

    switch (input.channel) {
      case 'pointer': {
        const target = this.capture.resolveTarget(input.pointerId, input.targetId);
        if (input.phase === 'down') {
          this.activePointers.add(input.pointerId);
        } else if (input.phase === 'up' || input.phase === 'cancel') {
          this.activePointers.delete(input.pointerId);
          if (input.phase === 'cancel') {
            const lost = this.capture.forceRelease(input.pointerId);
            if (lost !== undefined) {
              const lostEvent = createCaptureEvent(
                frameBase(),
                'lost',
                lost.pointerId,
                lost.owner
              );
              this.dispatcher.dispatch(lostEvent, input.timestamp);
              out.push(lostEvent);
            }
          }
        }
        this.diagnostics.setActivePointers(this.activePointers.size);

        if (this.configuration.trackHover) {
          for (const hover of this.hover.resolveTransition({
            targetId: target,
            position: input.position,
            pointerId: asPointerId(input.pointerId)
          })) {
            if (hover.phase === 'none') {
              continue;
            }
            const hoverEvent = createHoverEvent(
              frameBase(),
              hover.phase === 'leave' ? 'leave' : hover.phase === 'enter' ? 'enter' : 'move',
              hover.position,
              hover.pointerId,
              hover.phase === 'leave' ? hover.previous : hover.current
            );
            this.dispatcher.dispatch(hoverEvent, input.timestamp);
            out.push(hoverEvent);
          }
        }

        const event = this.pointerRouter.route(input, frameBase(), target);
        this.dispatcher.dispatch(event, input.timestamp);
        out.push(event);
        break;
      }
      case 'mouse': {
        const target = input.targetId;
        if (this.configuration.trackHover) {
          for (const hover of this.hover.resolveTransition({
            targetId: target,
            position: input.position
          })) {
            if (hover.phase === 'none' || hover.phase === 'move') {
              if (hover.phase === 'move') {
                const moveEvent = createHoverEvent(
                  frameBase(),
                  'move',
                  hover.position,
                  undefined,
                  hover.current
                );
                this.dispatcher.dispatch(moveEvent, input.timestamp);
                out.push(moveEvent);
              }
              continue;
            }
            const hoverEvent = createHoverEvent(
              frameBase(),
              hover.phase,
              hover.position,
              undefined,
              hover.phase === 'leave' ? hover.previous : hover.current
            );
            this.dispatcher.dispatch(hoverEvent, input.timestamp);
            out.push(hoverEvent);
          }
        }
        const event = this.mouseRouter.route(input, frameBase(), target);
        this.dispatcher.dispatch(event, input.timestamp);
        out.push(event);
        break;
      }
      case 'keyboard': {
        const event = this.keyboardRouter.route(input, frameBase(), input.targetId);
        this.dispatcher.dispatch(event, input.timestamp);
        out.push(event);
        break;
      }
      case 'wheel': {
        const event = this.wheelRouter.route(input, frameBase(), input.targetId);
        this.dispatcher.dispatch(event, input.timestamp);
        out.push(event);
        break;
      }
      case 'touch': {
        const event = this.gestureRouter.routeTouch(input, frameBase(), input.targetId);
        this.dispatcher.dispatch(event, input.timestamp);
        out.push(event);
        break;
      }
      case 'gesture-reserved':
        break;
      default: {
        const _never: never = input;
        void _never;
        break;
      }
    }

    return out;
  }

  private frame(): EventFrame {
    return Object.freeze({
      sequence: this.dispatcher.nextSequence(),
      receivedAt: this.clock.now(),
      modifiers: this.modifiers.snapshot(),
      captureOwner: this.capture.primaryOwner(),
      focusOwner: this.focus.getOwner(),
      hoverTarget: this.hover.getTarget()
    });
  }
}
