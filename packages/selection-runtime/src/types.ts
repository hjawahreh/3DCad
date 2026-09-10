import { failure, success, type Result } from '@cad-studio/platform-runtime';
import type { InteractionSessionId } from '@cad-studio/interaction-runtime';

export type SelectionErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'validation'
  | 'lifecycle'
  | 'policy'
  | 'unexpected';

export interface SelectionError {
  readonly code: SelectionErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type SelectionResult<T> = Result<T, SelectionError>;

export const selectionSuccess = <T>(value: T): SelectionResult<T> => success(value);

export const selectionFailure = (
  code: SelectionErrorCode,
  message: string,
  cause?: unknown
): SelectionResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type SelectionRuntimeId = Brand<string, 'SelectionRuntimeId'>;
export type SelectionSessionId = Brand<string, 'SelectionSessionId'>;
/** Opaque selectable target — host-supplied; no geometry/picking meaning here. */
export type SelectionTargetId = Brand<string, 'SelectionTargetId'>;
export type SelectionRevision = Brand<number, 'SelectionRevision'>;

export const asSelectionRuntimeId = (value: string): SelectionRuntimeId =>
  value as SelectionRuntimeId;
export const asSelectionSessionId = (value: string): SelectionSessionId =>
  value as SelectionSessionId;
export const asSelectionTargetId = (value: string): SelectionTargetId =>
  value as SelectionTargetId;
export const asSelectionRevision = (value: number): SelectionRevision =>
  value as SelectionRevision;

export type { InteractionSessionId };

export type SelectionMode =
  | 'replace'
  | 'add'
  | 'subtract'
  | 'toggle'
  | 'range-reserved';

export interface SelectionClock {
  readonly now: () => number;
}

export const createDefaultSelectionClock = (): SelectionClock => ({
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
});
