/**
 * Segmentation history — accepted results + review actions (undo/redo).
 */

import type { ClinicalDocumentSnapshot } from '../../document/ClinicalDocument.js';
import type { SegmentationPrediction } from '../prediction/types.js';
import type { ReviewActionMeta } from '../review/ClinicalSegmentationReview.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../../runtime/types.js';

export interface SegmentationHistoryEntry {
  readonly label: string;
  readonly prediction: SegmentationPrediction | undefined;
  readonly reviewMeta: ReviewActionMeta | undefined;
  readonly previousDocument: ClinicalDocumentSnapshot;
  readonly nextDocument: ClinicalDocumentSnapshot;
  readonly createdAt: number;
}

export class ClinicalSegmentationHistory {
  private readonly undoStack: SegmentationHistoryEntry[] = [];
  private readonly redoStack: SegmentationHistoryEntry[] = [];
  private readonly maxDepth = 64;

  public push(entry: SegmentationHistoryEntry): void {
    this.undoStack.push(Object.freeze(entry));
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): ClinicalResult<SegmentationHistoryEntry> {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return clinicalFailure('lifecycle', 'Nothing to undo');
    }
    this.redoStack.push(entry);
    return clinicalSuccess(entry);
  }

  public redo(): ClinicalResult<SegmentationHistoryEntry> {
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      return clinicalFailure('lifecycle', 'Nothing to redo');
    }
    this.undoStack.push(entry);
    return clinicalSuccess(entry);
  }

  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
