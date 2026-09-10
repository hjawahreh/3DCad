import type { SelectionTargetId, SelectionRevision, SelectionMode } from './types.js';
import type { SelectionLifecyclePhase } from './lifecycle.js';

/**
 * Working selection set (session-owned). Publish via ImmutableSelectionSnapshot.
 */
export interface SelectionState {
  readonly ids: readonly SelectionTargetId[];
  readonly revision: SelectionRevision;
  readonly mode: SelectionMode | undefined;
  readonly documentRevision: number | undefined;
}

/**
 * Immutable selection snapshot for consumers / history / clipboard.
 * Ownership: value object; safe to share after publication.
 * Selection identity and order are frozen; zero mutable state.
 */
export interface ImmutableSelectionSnapshot {
  readonly ids: readonly SelectionTargetId[];
  readonly revision: SelectionRevision;
  readonly mode: SelectionMode | undefined;
  readonly documentRevision: number | undefined;
  readonly count: number;
  readonly createdAt: number;
  readonly empty: boolean;
}

export const freezeSelectionSnapshot = (input: {
  readonly ids: readonly SelectionTargetId[];
  readonly revision: SelectionRevision;
  readonly mode: SelectionMode | undefined;
  readonly documentRevision: number | undefined;
  readonly createdAt: number;
}): ImmutableSelectionSnapshot => {
  const ids = Object.freeze([...input.ids]);
  return Object.freeze({
    ids,
    revision: input.revision,
    mode: input.mode,
    documentRevision: input.documentRevision,
    count: ids.length,
    createdAt: input.createdAt,
    empty: ids.length === 0
  });
};

export interface SelectionPublicState {
  readonly phase: SelectionLifecyclePhase;
  readonly snapshot: ImmutableSelectionSnapshot;
  readonly pending: boolean;
}
