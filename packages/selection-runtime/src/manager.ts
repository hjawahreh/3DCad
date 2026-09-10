import type { SelectionClock, SelectionMode, SelectionTargetId } from './types.js';
import { asSelectionRevision } from './types.js';
import {
  freezeSelectionSnapshot,
  type ImmutableSelectionSnapshot,
  type SelectionState
} from './state.js';

/**
 * Owns working selection and publishes immutable snapshots.
 * Lookup is O(1) via Set; order preserved in array.
 */
export class SelectionManager {
  private ids: SelectionTargetId[] = [];
  private readonly index = new Set<string>();
  private revision = 0;
  private mode: SelectionMode | undefined;
  private documentRevision: number | undefined;
  private snapshot: ImmutableSelectionSnapshot;
  private pending: SelectionTargetId[] | undefined;
  private pendingMode: SelectionMode | undefined;

  public constructor(private readonly clock: SelectionClock) {
    this.snapshot = this.publish();
  }

  public getSnapshot(): ImmutableSelectionSnapshot {
    return this.snapshot;
  }

  public getState(): SelectionState {
    return Object.freeze({
      ids: Object.freeze([...this.ids]),
      revision: asSelectionRevision(this.revision),
      mode: this.mode,
      documentRevision: this.documentRevision
    });
  }

  public has(id: SelectionTargetId | string): boolean {
    return this.index.has(id as string);
  }

  public beginModify(mode: SelectionMode, ids: readonly SelectionTargetId[]): void {
    this.pending = [...ids];
    this.pendingMode = mode;
  }

  public getPending(): {
    readonly ids: readonly SelectionTargetId[];
    readonly mode: SelectionMode | undefined;
  } {
    return Object.freeze({
      ids: Object.freeze([...(this.pending ?? this.ids)]),
      mode: this.pendingMode ?? this.mode
    });
  }

  public commitPending(
    ids: readonly SelectionTargetId[],
    mode: SelectionMode,
    documentRevision?: number
  ): ImmutableSelectionSnapshot {
    this.ids = [...ids];
    this.index.clear();
    for (const id of this.ids) {
      this.index.add(id as string);
    }
    this.mode = mode;
    if (documentRevision !== undefined) {
      this.documentRevision = documentRevision;
    }
    this.pending = undefined;
    this.pendingMode = undefined;
    this.revision += 1;
    this.snapshot = this.publish();
    return this.snapshot;
  }

  public restore(snapshot: ImmutableSelectionSnapshot): ImmutableSelectionSnapshot {
    this.ids = [...snapshot.ids];
    this.index.clear();
    for (const id of this.ids) {
      this.index.add(id as string);
    }
    this.mode = snapshot.mode;
    this.documentRevision = snapshot.documentRevision;
    this.pending = undefined;
    this.pendingMode = undefined;
    this.revision = Number(snapshot.revision);
    this.snapshot = freezeSelectionSnapshot({
      ids: this.ids,
      revision: asSelectionRevision(this.revision),
      mode: this.mode,
      documentRevision: this.documentRevision,
      createdAt: this.clock.now()
    });
    return this.snapshot;
  }

  public clear(): ImmutableSelectionSnapshot {
    const previous = this.snapshot;
    this.ids = [];
    this.index.clear();
    this.mode = undefined;
    this.pending = undefined;
    this.pendingMode = undefined;
    this.revision += 1;
    this.snapshot = this.publish();
    void previous;
    return this.snapshot;
  }

  public pendingSnapshot(): ImmutableSelectionSnapshot {
    return freezeSelectionSnapshot({
      ids: this.pending ?? this.ids,
      revision: asSelectionRevision(this.revision),
      mode: this.pendingMode ?? this.mode,
      documentRevision: this.documentRevision,
      createdAt: this.clock.now()
    });
  }

  private publish(): ImmutableSelectionSnapshot {
    return freezeSelectionSnapshot({
      ids: this.ids,
      revision: asSelectionRevision(this.revision),
      mode: this.mode,
      documentRevision: this.documentRevision,
      createdAt: this.clock.now()
    });
  }
}
