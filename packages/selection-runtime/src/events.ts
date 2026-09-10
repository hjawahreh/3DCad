import type { ImmutableSelectionSnapshot } from './state.js';
import type { SelectionMode, SelectionTargetId } from './types.js';

export type SelectionEventType =
  | 'lifecycle'
  | 'modify'
  | 'commit'
  | 'clear'
  | 'clipboard'
  | 'history'
  | 'policy'
  | 'error'
  | 'warning';

export interface SelectionLifecycleEvent {
  readonly type: 'lifecycle';
  readonly phase: string;
  readonly at: number;
}

export interface SelectionModifyEvent {
  readonly type: 'modify';
  readonly mode: SelectionMode;
  readonly targets: readonly SelectionTargetId[];
  readonly pending: ImmutableSelectionSnapshot;
  readonly at: number;
}

export interface SelectionCommitEvent {
  readonly type: 'commit';
  readonly snapshot: ImmutableSelectionSnapshot;
  readonly previous: ImmutableSelectionSnapshot;
  readonly at: number;
}

export interface SelectionClearEvent {
  readonly type: 'clear';
  readonly previous: ImmutableSelectionSnapshot;
  readonly at: number;
}

export interface SelectionClipboardEvent {
  readonly type: 'clipboard';
  readonly operation: 'copy' | 'duplicate' | 'clear';
  readonly count: number;
  readonly at: number;
}

export interface SelectionHistoryEvent {
  readonly type: 'history';
  readonly operation: 'push' | 'undo' | 'redo';
  readonly snapshot: ImmutableSelectionSnapshot;
  readonly at: number;
}

export interface SelectionPolicyEvent {
  readonly type: 'policy';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface SelectionErrorEvent {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface SelectionWarningEvent {
  readonly type: 'warning';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export type SelectionEvent =
  | SelectionLifecycleEvent
  | SelectionModifyEvent
  | SelectionCommitEvent
  | SelectionClearEvent
  | SelectionClipboardEvent
  | SelectionHistoryEvent
  | SelectionPolicyEvent
  | SelectionErrorEvent
  | SelectionWarningEvent;

export type SelectionEventListener = (event: SelectionEvent) => void;

/**
 * Session event bus.
 * Threading: listeners run on emitting thread; keep non-blocking.
 */
export class SelectionEvents {
  private readonly listeners = new Set<SelectionEventListener>();

  public subscribe(listener: SelectionEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: SelectionEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
