import type { RawPlatformInput } from './raw-input.js';
import type { InteractionTargetId, ModifierKeys, MouseButton, Point2D, PointerType } from './types.js';
import { asInteractionTargetId, EMPTY_MODIFIERS } from './types.js';
import { interactionFailure, interactionSuccess, type InteractionResult } from './types.js';

export interface NormalizedPointer {
  readonly channel: 'pointer';
  readonly phase: 'down' | 'move' | 'up' | 'cancel' | 'enter' | 'leave';
  readonly pointerId: number;
  readonly pointerType: PointerType;
  readonly position: Point2D;
  readonly buttons: number;
  readonly button: MouseButton;
  readonly modifiers: ModifierKeys;
  readonly pressure: number | undefined;
  readonly timestamp: number;
  readonly targetId: InteractionTargetId | undefined;
}

export interface NormalizedMouse {
  readonly channel: 'mouse';
  readonly phase: 'down' | 'move' | 'up' | 'enter' | 'leave' | 'dblclick';
  readonly position: Point2D;
  readonly buttons: number;
  readonly button: MouseButton;
  readonly modifiers: ModifierKeys;
  readonly timestamp: number;
  readonly targetId: InteractionTargetId | undefined;
}

export interface NormalizedKeyboard {
  readonly channel: 'keyboard';
  readonly phase: 'down' | 'up' | 'repeat';
  readonly key: string;
  readonly code: string;
  readonly modifiers: ModifierKeys;
  readonly repeat: boolean;
  readonly timestamp: number;
  readonly targetId: InteractionTargetId | undefined;
}

export interface NormalizedWheel {
  readonly channel: 'wheel';
  readonly position: Point2D;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaZ: number;
  readonly deltaMode: 'pixel' | 'line' | 'page';
  readonly modifiers: ModifierKeys;
  readonly timestamp: number;
  readonly targetId: InteractionTargetId | undefined;
}

export interface NormalizedTouch {
  readonly channel: 'touch';
  readonly phase: 'start' | 'move' | 'end' | 'cancel';
  readonly touches: readonly { readonly identifier: number; readonly position: Point2D }[];
  readonly modifiers: ModifierKeys;
  readonly timestamp: number;
  readonly targetId: InteractionTargetId | undefined;
}

export interface NormalizedGestureReserved {
  readonly channel: 'gesture-reserved';
  readonly gestureType: string;
  readonly timestamp: number;
}

export type NormalizedInput =
  | NormalizedPointer
  | NormalizedMouse
  | NormalizedKeyboard
  | NormalizedWheel
  | NormalizedTouch
  | NormalizedGestureReserved;

const resolveTarget = (targetId: string | undefined): InteractionTargetId | undefined =>
  targetId === undefined || targetId.length === 0
    ? undefined
    : asInteractionTargetId(targetId);

const freezePoint = (p: Point2D): Point2D => Object.freeze({ x: p.x, y: p.y });

const freezeModifiers = (m: ModifierKeys | undefined): ModifierKeys =>
  m === undefined
    ? EMPTY_MODIFIERS
    : Object.freeze({
        alt: m.alt === true,
        ctrl: m.ctrl === true,
        meta: m.meta === true,
        shift: m.shift === true
      });

/**
 * Converts raw platform input into validated normalized channels.
 * Filtering: rejects NaN positions / empty keyboard keys.
 */
export class InputNormalizer {
  public normalize(raw: RawPlatformInput): InteractionResult<NormalizedInput> {
    switch (raw.kind) {
      case 'pointer': {
        if (!Number.isFinite(raw.position.x) || !Number.isFinite(raw.position.y)) {
          return interactionFailure('validation', 'Pointer position must be finite');
        }
        return interactionSuccess(
          Object.freeze({
            channel: 'pointer',
            phase: raw.phase,
            pointerId: raw.pointerId,
            pointerType: raw.pointerType,
            position: freezePoint(raw.position),
            buttons: raw.buttons,
            button: raw.button,
            modifiers: freezeModifiers(raw.modifiers),
            pressure: raw.pressure,
            timestamp: raw.timestamp,
            targetId: resolveTarget(raw.targetId)
          })
        );
      }
      case 'mouse': {
        if (!Number.isFinite(raw.position.x) || !Number.isFinite(raw.position.y)) {
          return interactionFailure('validation', 'Mouse position must be finite');
        }
        return interactionSuccess(
          Object.freeze({
            channel: 'mouse',
            phase: raw.phase,
            position: freezePoint(raw.position),
            buttons: raw.buttons,
            button: raw.button,
            modifiers: freezeModifiers(raw.modifiers),
            timestamp: raw.timestamp,
            targetId: resolveTarget(raw.targetId)
          })
        );
      }
      case 'keyboard': {
        if (raw.key.length === 0 && raw.code.length === 0) {
          return interactionFailure('validation', 'Keyboard event requires key or code');
        }
        return interactionSuccess(
          Object.freeze({
            channel: 'keyboard',
            phase: raw.phase,
            key: raw.key,
            code: raw.code,
            modifiers: freezeModifiers(raw.modifiers),
            repeat: raw.repeat,
            timestamp: raw.timestamp,
            targetId: resolveTarget(raw.targetId)
          })
        );
      }
      case 'wheel': {
        return interactionSuccess(
          Object.freeze({
            channel: 'wheel',
            position: freezePoint(raw.position),
            deltaX: raw.deltaX,
            deltaY: raw.deltaY,
            deltaZ: raw.deltaZ,
            deltaMode: raw.deltaMode,
            modifiers: freezeModifiers(raw.modifiers),
            timestamp: raw.timestamp,
            targetId: resolveTarget(raw.targetId)
          })
        );
      }
      case 'touch': {
        return interactionSuccess(
          Object.freeze({
            channel: 'touch',
            phase: raw.phase,
            touches: Object.freeze(
              raw.touches.map((t) =>
                Object.freeze({
                  identifier: t.identifier,
                  position: freezePoint(t.position)
                })
              )
            ),
            modifiers: freezeModifiers(raw.modifiers),
            timestamp: raw.timestamp,
            targetId: resolveTarget(raw.targetId)
          })
        );
      }
      case 'gesture-reserved': {
        return interactionSuccess(
          Object.freeze({
            channel: 'gesture-reserved',
            gestureType: raw.gestureType,
            timestamp: raw.timestamp
          })
        );
      }
      default: {
        const _exhaustive: never = raw;
        return interactionFailure('invalid', `Unknown raw input kind: ${String(_exhaustive)}`);
      }
    }
  }
}
