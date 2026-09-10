import type { ModifierKeys } from './types.js';
import { EMPTY_MODIFIERS } from './types.js';

/**
 * Tracks current modifier key chord.
 * Ownership: session-owned mutable; publish via snapshot().
 */
export class ModifierState {
  private current: ModifierKeys = EMPTY_MODIFIERS;

  public update(next: ModifierKeys): ModifierKeys {
    this.current = Object.freeze({
      alt: next.alt,
      ctrl: next.ctrl,
      meta: next.meta,
      shift: next.shift
    });
    return this.current;
  }

  public applyKey(key: string, down: boolean): ModifierKeys {
    const lower = key.toLowerCase();
    const next = {
      alt: this.current.alt,
      ctrl: this.current.ctrl,
      meta: this.current.meta,
      shift: this.current.shift
    };
    if (lower === 'alt' || lower === 'altleft' || lower === 'altright') {
      next.alt = down;
    } else if (lower === 'control' || lower === 'ctrl' || lower === 'controlleft' || lower === 'controlright') {
      next.ctrl = down;
    } else if (lower === 'meta' || lower === 'metaleft' || lower === 'metaright' || lower === 'os') {
      next.meta = down;
    } else if (lower === 'shift' || lower === 'shiftleft' || lower === 'shiftright') {
      next.shift = down;
    }
    return this.update(next);
  }

  public snapshot(): ModifierKeys {
    return this.current;
  }

  public clear(): void {
    this.current = EMPTY_MODIFIERS;
  }
}
