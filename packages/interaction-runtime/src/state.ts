import type { CursorId, InteractionTargetId, ModifierKeys, PointerId } from './types.js';
import { EMPTY_MODIFIERS } from './types.js';
import type { InteractionLifecyclePhase } from './lifecycle.js';

export interface InteractionState {
  readonly phase: InteractionLifecyclePhase;
  readonly modifiers: ModifierKeys;
  readonly focusOwner: InteractionTargetId | undefined;
  readonly hoverTarget: InteractionTargetId | undefined;
  readonly captureOwner: InteractionTargetId | undefined;
  readonly capturedPointers: readonly PointerId[];
  readonly activeCursor: CursorId | undefined;
  readonly sequence: number;
  readonly queueDepth: number;
}

export const emptyInteractionState = (
  phase: InteractionLifecyclePhase = 'created'
): InteractionState =>
  Object.freeze({
    phase,
    modifiers: EMPTY_MODIFIERS,
    focusOwner: undefined,
    hoverTarget: undefined,
    captureOwner: undefined,
    capturedPointers: Object.freeze([]),
    activeCursor: undefined,
    sequence: 0,
    queueDepth: 0
  });
