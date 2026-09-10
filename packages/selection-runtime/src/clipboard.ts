import type { ImmutableSelectionSnapshot } from './state.js';
import { selectionFailure, selectionSuccess, type SelectionResult } from './types.js';

/**
 * Runtime clipboard for selection references only.
 * Does not serialize geometry or duplicate scene objects.
 */
export class SelectionClipboard {
  private payload: ImmutableSelectionSnapshot | undefined;
  private copyCount = 0;
  private clearCount = 0;

  public copy(snapshot: ImmutableSelectionSnapshot): SelectionResult<ImmutableSelectionSnapshot> {
    this.payload = snapshot;
    this.copyCount += 1;
    return selectionSuccess(snapshot);
  }

  /** Duplicate references — returns a frozen copy of clipboard ids (not scene objects). */
  public duplicate(): SelectionResult<ImmutableSelectionSnapshot> {
    if (this.payload === undefined) {
      return selectionFailure('not-found', 'Clipboard is empty');
    }
    return selectionSuccess(this.payload);
  }

  public peek(): ImmutableSelectionSnapshot | undefined {
    return this.payload;
  }

  public clear(): void {
    this.payload = undefined;
    this.clearCount += 1;
  }

  public isEmpty(): boolean {
    return this.payload === undefined || this.payload.empty;
  }

  public getCopyCount(): number {
    return this.copyCount;
  }

  public getClearCount(): number {
    return this.clearCount;
  }
}
