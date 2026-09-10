/**
 * ClinicalOrientationHistory — transform-only undo/redo stack (clinical host).
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';

export interface ClinicalOrientationHistoryEntry {
  readonly kind: 'orientation-transform';
  readonly id: string;
  readonly label: string;
  readonly objectId: string;
  readonly previous: ClinicalDocumentSnapshot;
  readonly next: ClinicalDocumentSnapshot;
  readonly createdAt: number;
}

export class ClinicalOrientationHistory {
  private readonly undoStack: ClinicalOrientationHistoryEntry[] = [];
  private readonly redoStack: ClinicalOrientationHistoryEntry[] = [];
  private serial = 0;
  private pushCount = 0;
  private undoCount = 0;
  private redoCount = 0;

  public constructor(private readonly limit = 64) {}

  public push(input: {
    readonly label: string;
    readonly objectId: string;
    readonly previous: ClinicalDocumentSnapshot;
    readonly next: ClinicalDocumentSnapshot;
    readonly createdAt: number;
  }): ClinicalOrientationHistoryEntry {
    this.serial += 1;
    const entry = Object.freeze({
      kind: 'orientation-transform' as const,
      id: `orient-hist-${String(this.serial)}`,
      label: input.label,
      objectId: input.objectId,
      previous: input.previous,
      next: input.next,
      createdAt: input.createdAt
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

  public undo(): ClinicalResult<ClinicalOrientationHistoryEntry> {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return clinicalFailure('not-found', 'Nothing to undo');
    }
    this.redoStack.push(entry);
    this.undoCount += 1;
    return clinicalSuccess(entry);
  }

  public redo(): ClinicalResult<ClinicalOrientationHistoryEntry> {
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      return clinicalFailure('not-found', 'Nothing to redo');
    }
    this.undoStack.push(entry);
    this.redoCount += 1;
    return clinicalSuccess(entry);
  }

  public peekUndo(): ClinicalOrientationHistoryEntry | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }

  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  public snapshot() {
    return Object.freeze({
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      pushCount: this.pushCount,
      undoCount: this.undoCount,
      redoCount: this.redoCount
    });
  }
}
