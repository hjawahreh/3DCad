/**
 * ClinicalCloseBaseHistory — close-base undo/redo (clinical document snapshots).
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';

export interface ClinicalCloseBaseHistoryEntry {
  readonly kind: 'close-base';
  readonly id: string;
  readonly label: string;
  readonly objectId: string;
  readonly fingerprint: string;
  readonly strategy: string;
  readonly previous: ClinicalDocumentSnapshot;
  readonly next: ClinicalDocumentSnapshot;
  readonly createdAt: number;
}

export class ClinicalCloseBaseHistory {
  private readonly undoStack: ClinicalCloseBaseHistoryEntry[] = [];
  private readonly redoStack: ClinicalCloseBaseHistoryEntry[] = [];
  private serial = 0;

  public push(input: {
    readonly label: string;
    readonly objectId: string;
    readonly fingerprint: string;
    readonly strategy: string;
    readonly previous: ClinicalDocumentSnapshot;
    readonly next: ClinicalDocumentSnapshot;
    readonly createdAt: number;
  }): ClinicalCloseBaseHistoryEntry {
    this.serial += 1;
    const entry = Object.freeze({
      kind: 'close-base' as const,
      id: `close-base-hist-${String(this.serial)}`,
      label: input.label,
      objectId: input.objectId,
      fingerprint: input.fingerprint,
      strategy: input.strategy,
      previous: input.previous,
      next: input.next,
      createdAt: input.createdAt
    });
    this.undoStack.push(entry);
    this.redoStack.length = 0;
    while (this.undoStack.length > 64) {
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

  public undo(): ClinicalResult<ClinicalCloseBaseHistoryEntry> {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return clinicalFailure('not-found', 'Nothing to undo');
    }
    this.redoStack.push(entry);
    return clinicalSuccess(entry);
  }

  public redo(): ClinicalResult<ClinicalCloseBaseHistoryEntry> {
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      return clinicalFailure('not-found', 'Nothing to redo');
    }
    this.undoStack.push(entry);
    return clinicalSuccess(entry);
  }

  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  public snapshot() {
    return Object.freeze({
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length
    });
  }
}
