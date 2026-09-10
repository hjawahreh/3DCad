import type {
  ModifierKeys,
  MouseButton,
  Point2D,
  PointerId,
  PointerType
} from './types.js';

/**
 * Raw platform input as received from DOM / host adapters.
 * Ownership: caller; normalizer reads only and produces immutable events.
 */
export type RawInputKind =
  | 'pointer'
  | 'mouse'
  | 'keyboard'
  | 'wheel'
  | 'touch'
  | 'gesture-reserved';

export interface RawPointerInput {
  readonly kind: 'pointer';
  readonly phase: 'down' | 'move' | 'up' | 'cancel' | 'enter' | 'leave';
  readonly pointerId: number;
  readonly pointerType: PointerType;
  readonly position: Point2D;
  readonly buttons: number;
  readonly button: MouseButton;
  readonly modifiers: ModifierKeys;
  readonly pressure?: number;
  readonly timestamp: number;
  readonly targetId?: string;
}

export interface RawMouseInput {
  readonly kind: 'mouse';
  readonly phase: 'down' | 'move' | 'up' | 'enter' | 'leave' | 'dblclick';
  readonly position: Point2D;
  readonly buttons: number;
  readonly button: MouseButton;
  readonly modifiers: ModifierKeys;
  readonly timestamp: number;
  readonly targetId?: string;
}

export interface RawKeyboardInput {
  readonly kind: 'keyboard';
  readonly phase: 'down' | 'up' | 'repeat';
  readonly key: string;
  readonly code: string;
  readonly modifiers: ModifierKeys;
  readonly repeat: boolean;
  readonly timestamp: number;
  readonly targetId?: string;
}

export interface RawWheelInput {
  readonly kind: 'wheel';
  readonly position: Point2D;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaZ: number;
  readonly deltaMode: 'pixel' | 'line' | 'page';
  readonly modifiers: ModifierKeys;
  readonly timestamp: number;
  readonly targetId?: string;
}

/** Basic touch abstraction (not advanced multi-touch gesture recognition). */
export interface RawTouchInput {
  readonly kind: 'touch';
  readonly phase: 'start' | 'move' | 'end' | 'cancel';
  readonly touches: readonly {
    readonly identifier: number;
    readonly position: Point2D;
  }[];
  readonly modifiers: ModifierKeys;
  readonly timestamp: number;
  readonly targetId?: string;
}

/** Reserved — advanced multi-touch gesture recognition not implemented in COD-009. */
export interface RawGestureReservedInput {
  readonly kind: 'gesture-reserved';
  readonly gestureType: string;
  readonly timestamp: number;
}

export type RawPlatformInput =
  | RawPointerInput
  | RawMouseInput
  | RawKeyboardInput
  | RawWheelInput
  | RawTouchInput
  | RawGestureReservedInput;

export type { PointerId };
