import type {
  CaptureInteractionEvent,
  CursorInteractionEvent,
  FocusInteractionEvent,
  HoverInteractionEvent,
  InteractionEvent,
  KeyboardInteractionEvent,
  MouseInteractionEvent,
  PointerInteractionEvent,
  TouchInteractionEvent,
  WheelInteractionEvent
} from './events.js';
import type { InteractionTargetId, ModifierKeys, PointerId } from './types.js';
import { asPointerId, EMPTY_MODIFIERS } from './types.js';
import type {
  NormalizedKeyboard,
  NormalizedMouse,
  NormalizedPointer,
  NormalizedTouch,
  NormalizedWheel
} from './input-normalizer.js';

export interface EventFrame {
  readonly sequence: number;
  readonly receivedAt: number;
  readonly modifiers: ModifierKeys;
  readonly captureOwner: InteractionTargetId | undefined;
  readonly focusOwner: InteractionTargetId | undefined;
  readonly hoverTarget: InteractionTargetId | undefined;
}

const base = (
  kind: InteractionEvent['kind'],
  frame: EventFrame,
  timestamp: number,
  targetId: InteractionTargetId | undefined
): Omit<InteractionEvent, 'kind'> & { readonly kind: InteractionEvent['kind'] } =>
  Object.freeze({
    kind,
    sequence: frame.sequence,
    timestamp,
    receivedAt: frame.receivedAt,
    modifiers: frame.modifiers,
    targetId,
    captureOwner: frame.captureOwner,
    focusOwner: frame.focusOwner,
    hoverTarget: frame.hoverTarget
  });

export class PointerRouter {
  public route(
    input: NormalizedPointer,
    frame: EventFrame,
    resolvedTarget: InteractionTargetId | undefined
  ): PointerInteractionEvent {
    return Object.freeze({
      ...base('pointer', frame, input.timestamp, resolvedTarget),
      kind: 'pointer',
      phase: input.phase,
      pointerId: asPointerId(input.pointerId),
      pointerType: input.pointerType,
      position: input.position,
      buttons: input.buttons,
      button: input.button,
      pressure: input.pressure
    });
  }
}

export class MouseRouter {
  public route(
    input: NormalizedMouse,
    frame: EventFrame,
    resolvedTarget: InteractionTargetId | undefined
  ): MouseInteractionEvent {
    return Object.freeze({
      ...base('mouse', frame, input.timestamp, resolvedTarget),
      kind: 'mouse',
      phase: input.phase,
      position: input.position,
      buttons: input.buttons,
      button: input.button
    });
  }
}

export class KeyboardRouter {
  public route(
    input: NormalizedKeyboard,
    frame: EventFrame,
    resolvedTarget: InteractionTargetId | undefined
  ): KeyboardInteractionEvent {
    return Object.freeze({
      ...base('keyboard', frame, input.timestamp, resolvedTarget ?? frame.focusOwner),
      kind: 'keyboard',
      phase: input.phase,
      key: input.key,
      code: input.code,
      repeat: input.repeat
    });
  }
}

export class WheelRouter {
  public route(
    input: NormalizedWheel,
    frame: EventFrame,
    resolvedTarget: InteractionTargetId | undefined
  ): WheelInteractionEvent {
    return Object.freeze({
      ...base('wheel', frame, input.timestamp, resolvedTarget),
      kind: 'wheel',
      position: input.position,
      deltaX: input.deltaX,
      deltaY: input.deltaY,
      deltaZ: input.deltaZ,
      deltaMode: input.deltaMode
    });
  }
}

export class GestureRouter {
  /** Basic touch abstraction routing — not advanced multi-touch recognition. */
  public routeTouch(
    input: NormalizedTouch,
    frame: EventFrame,
    resolvedTarget: InteractionTargetId | undefined
  ): TouchInteractionEvent {
    return Object.freeze({
      ...base('touch', frame, input.timestamp, resolvedTarget),
      kind: 'touch',
      phase: input.phase,
      touches: input.touches
    });
  }
}

export const createHoverEvent = (
  frame: EventFrame,
  phase: 'enter' | 'leave' | 'move',
  position: { readonly x: number; readonly y: number },
  pointerId: PointerId | undefined,
  targetId: InteractionTargetId | undefined
): HoverInteractionEvent =>
  Object.freeze({
    ...base('hover', frame, frame.receivedAt, targetId),
    kind: 'hover',
    phase,
    position,
    pointerId
  });

export const createFocusEvent = (
  frame: EventFrame,
  phase: 'focus' | 'blur',
  owner: InteractionTargetId | undefined
): FocusInteractionEvent =>
  Object.freeze({
    ...base('focus', frame, frame.receivedAt, owner),
    kind: 'focus',
    phase,
    owner,
    modifiers: frame.modifiers ?? EMPTY_MODIFIERS
  });

export const createCaptureEvent = (
  frame: EventFrame,
  phase: 'acquired' | 'released' | 'lost',
  pointerId: PointerId,
  owner: InteractionTargetId | undefined
): CaptureInteractionEvent =>
  Object.freeze({
    ...base('capture', frame, frame.receivedAt, owner),
    kind: 'capture',
    phase,
    pointerId,
    owner
  });

export const createCursorEvent = (
  frame: EventFrame,
  cursorId: import('./types.js').CursorId,
  owner: InteractionTargetId | undefined
): CursorInteractionEvent =>
  Object.freeze({
    ...base('cursor', frame, frame.receivedAt, owner),
    kind: 'cursor',
    phase: 'changed',
    cursorId,
    owner
  });
