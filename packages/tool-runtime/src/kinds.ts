import type { OperationHandler } from './operation.js';
import { RESERVED_OPERATION_KINDS, opSuccess, type OperationKind } from './types.js';

/**
 * Default no-op handlers for reserved kinds.
 * Clinical packages replace these with real kernel request builders.
 */
export const createPassthroughHandler = (kind: OperationKind): OperationHandler => ({
  kind,
  validate: () => opSuccess(undefined)
});

export const createDefaultHandlers = (): readonly OperationHandler[] =>
  RESERVED_OPERATION_KINDS.map((kind) => createPassthroughHandler(kind));
