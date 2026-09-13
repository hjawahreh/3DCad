/**
 * ClinicalTrimHistory — trim operation undo/redo (document + mesh buffer snapshots).
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import { cloneMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';

export interface ClinicalTrimHistoryEntry {
  readonly kind: 'trim-mesh';
  readonly id: string;
  readonly label: string;
  readonly objectId: string;
  readonly fingerprint: string;
  readonly previous: ClinicalDocumentSnapshot;
  readonly next: ClinicalDocumentSnapshot;
  /** Working-mesh buffer before the trim (for registry rollback). */
  readonly previousMesh: TriangleMesh;
  /** Working-mesh buffer after the trim. */
  readonly nextMesh: TriangleMesh;
  readonly createdAt: number;
}

export class ClinicalTrimHistory {
  private readonly undoStack: ClinicalTrimHistoryEntry[] = [];
  private readonly redoStack: ClinicalTrimHistoryEntry[] = [];
  private serial = 0;

  public push(input: {
    readonly label: string;
    readonly objectId: string;
    readonly fingerprint: string;
    readonly previous: ClinicalDocumentSnapshot;
    readonly next: ClinicalDocumentSnapshot;
    readonly previousMesh: TriangleMesh;
    readonly nextMesh: TriangleMesh;
    readonly createdAt: number;
  }): ClinicalTrimHistoryEntry {
    this.serial += 1;
    const entry = Object.freeze({
      kind: 'trim-mesh' as const,
      id: `trim-hist-${String(this.serial)}`,
      label: input.label,
      objectId: input.objectId,
      fingerprint: input.fingerprint,
      previous: input.previous,
      next: input.next,
      previousMesh: cloneMesh(input.previousMesh),
      nextMesh: cloneMesh(input.nextMesh),
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

  public undo(): ClinicalResult<ClinicalTrimHistoryEntry> {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return clinicalFailure('not-found', 'Nothing to undo');
    }
    this.redoStack.push(entry);
    return clinicalSuccess(entry);
  }

  public redo(): ClinicalResult<ClinicalTrimHistoryEntry> {
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
