import { freeze } from '@cad-studio/platform-runtime';
import type { ImmutableSelectionSnapshot } from './state.js';
import { selectionFailure, selectionSuccess, type SelectionResult } from './types.js';

/**
 * Immutable history entry contributed to Platform Runtime-style undo stacks.
 * Selection Runtime does not own global undo/redo — host applies entries.
 */
export interface SelectionHistoryEntry {
  readonly kind: 'selection';
  readonly id: string;
  readonly previous: ImmutableSelectionSnapshot;
  readonly next: ImmutableSelectionSnapshot;
  readonly createdAt: number;
  readonly label: string;
}

/**
 * Local selection history buffer for undo/redo hooks.
 * Integrates by emitting immutable entries; does not own application history.
 */
export class SelectionHistory {
  private readonly undoStack: SelectionHistoryEntry[] = [];
  private readonly redoStack: SelectionHistoryEntry[] = [];
  private entrySerial = 0;
  private pushCount = 0;

  public constructor(private readonly limit: number) {}

  public push(
    previous: ImmutableSelectionSnapshot,
    next: ImmutableSelectionSnapshot,
    label = 'selection-change'
  ): SelectionHistoryEntry {
    const entry = freeze({
      kind: 'selection' as const,
      id: `sel-hist-${String(++this.entrySerial)}`,
      previous,
      next,
      createdAt: next.createdAt,
      label
    });
    this.undoStack.push(entry);
    this.redoStack.length = 0;
    this.pushCount += 1;
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    return entry;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): SelectionResult<SelectionHistoryEntry> {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return selectionFailure('not-found', 'Nothing to undo');
    }
    this.redoStack.push(entry);
    return selectionSuccess(entry);
  }

  public redo(): SelectionResult<SelectionHistoryEntry> {
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      return selectionFailure('not-found', 'Nothing to redo');
    }
    this.undoStack.push(entry);
    return selectionSuccess(entry);
  }

  public peekUndo(): SelectionHistoryEntry | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }

  public entries(): readonly SelectionHistoryEntry[] {
    return Object.freeze([...this.undoStack]);
  }

  public getPushCount(): number {
    return this.pushCount;
  }

  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
