import type {
  CursorId,
  InteractionTargetId,
  ModifierKeys,
  MouseButton,
  Point2D,
  PointerId,
  PointerType
} from './types.js';

export type InteractionEventKind =
  | 'pointer'
  | 'mouse'
  | 'keyboard'
  | 'wheel'
  | 'touch'
  | 'hover'
  | 'focus'
  | 'capture'
  | 'cursor'
  | 'gesture-reserved';

export interface InteractionEventBase {
  readonly kind: InteractionEventKind;
  readonly sequence: number;
  readonly timestamp: number;
  readonly receivedAt: number;
  readonly modifiers: ModifierKeys;
  readonly targetId: InteractionTargetId | undefined;
  readonly captureOwner: InteractionTargetId | undefined;
  readonly focusOwner: InteractionTargetId | undefined;
  readonly hoverTarget: InteractionTargetId | undefined;
}

export interface PointerInteractionEvent extends InteractionEventBase {
  readonly kind: 'pointer';
  readonly phase: 'down' | 'move' | 'up' | 'cancel' | 'enter' | 'leave';
  readonly pointerId: PointerId;
  readonly pointerType: PointerType;
  readonly position: Point2D;
  readonly buttons: number;
  readonly button: MouseButton;
  /** Reserved: pen pressure — present only when provided by platform. */
  readonly pressure: number | undefined;
}

export interface MouseInteractionEvent extends InteractionEventBase {
  readonly kind: 'mouse';
  readonly phase: 'down' | 'move' | 'up' | 'enter' | 'leave' | 'dblclick';
  readonly position: Point2D;
  readonly buttons: number;
  readonly button: MouseButton;
}

export interface KeyboardInteractionEvent extends InteractionEventBase {
  readonly kind: 'keyboard';
  readonly phase: 'down' | 'up' | 'repeat';
  readonly key: string;
  readonly code: string;
  readonly repeat: boolean;
}

export interface WheelInteractionEvent extends InteractionEventBase {
  readonly kind: 'wheel';
  readonly position: Point2D;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaZ: number;
  readonly deltaMode: 'pixel' | 'line' | 'page';
}

export interface TouchInteractionEvent extends InteractionEventBase {
  readonly kind: 'touch';
  readonly phase: 'start' | 'move' | 'end' | 'cancel';
  readonly touches: readonly {
    readonly identifier: number;
    readonly position: Point2D;
  }[];
}

export interface HoverInteractionEvent extends InteractionEventBase {
  readonly kind: 'hover';
  readonly phase: 'enter' | 'leave' | 'move';
  readonly position: Point2D;
  readonly pointerId: PointerId | undefined;
}

export interface FocusInteractionEvent extends InteractionEventBase {
  readonly kind: 'focus';
  readonly phase: 'focus' | 'blur';
  readonly owner: InteractionTargetId | undefined;
}

export interface CaptureInteractionEvent extends InteractionEventBase {
  readonly kind: 'capture';
  readonly phase: 'acquired' | 'released' | 'lost';
  readonly pointerId: PointerId;
  readonly owner: InteractionTargetId | undefined;
}

export interface CursorInteractionEvent extends InteractionEventBase {
  readonly kind: 'cursor';
  readonly phase: 'changed';
  readonly cursorId: CursorId;
  readonly owner: InteractionTargetId | undefined;
}

/** Reserved contract surface — never emitted by COD-009 routers. */
export interface GestureReservedInteractionEvent extends InteractionEventBase {
  readonly kind: 'gesture-reserved';
  readonly gestureType: string;
}

export type InteractionEvent =
  | PointerInteractionEvent
  | MouseInteractionEvent
  | KeyboardInteractionEvent
  | WheelInteractionEvent
  | TouchInteractionEvent
  | HoverInteractionEvent
  | FocusInteractionEvent
  | CaptureInteractionEvent
  | CursorInteractionEvent
  | GestureReservedInteractionEvent;

export type InteractionEventListener = (event: InteractionEvent) => void;

/**
 * Synchronous fan-out for immutable interaction events.
 * Ownership: session-owned; listeners must not retain session across dispose.
 * Threading: listeners run on the emitting thread; keep handlers non-blocking.
 */
export class InteractionEvents {
  private readonly listeners = new Set<InteractionEventListener>();

  public subscribe(listener: InteractionEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: InteractionEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }

  public size(): number {
    return this.listeners.size;
  }
}
