import { failure, success, type Result } from '@cad-studio/platform-runtime';

export type OperationErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'forbidden'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'validation'
  | 'kernel'
  | 'unexpected';

export interface OperationError {
  readonly code: OperationErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type OperationResult<T> = Result<T, OperationError>;

export const opSuccess = <T>(value: T): OperationResult<T> => success(value);

export const opFailure = (
  code: OperationErrorCode,
  message: string,
  cause?: unknown
): OperationResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type OperationId = Brand<string, 'OperationId'>;
export type CommitTokenId = Brand<string, 'CommitTokenId'>;
export type WorkflowStepId = Brand<string, 'WorkflowStepId'>;
export type DocumentRevision = Brand<number, 'DocumentRevision'>;

export const asOperationId = (value: string): OperationId => value as OperationId;
export const asCommitTokenId = (value: string): CommitTokenId => value as CommitTokenId;
export const asWorkflowStepId = (value: string): WorkflowStepId => value as WorkflowStepId;
export const asDocumentRevision = (value: number): DocumentRevision => value as DocumentRevision;

/**
 * Reserved CAD operation kinds. Concrete geometry lives in clinical packages;
 * this runtime only owns lifecycle and the commit gate.
 */
export type OperationKind =
  | 'trim'
  | 'close-base'
  | 'segmentation'
  | 'movement'
  | 'ipr'
  | 'collision'
  | 'boolean'
  | 'offset'
  | 'attachment-placement'
  | 'margin-detection'
  | 'model-repair'
  | 'mesh-healing'
  | 'custom';

export type OperationPhase =
  | 'created'
  | 'active'
  | 'previewing'
  | 'executing'
  | 'validating'
  | 'ready-to-commit'
  | 'committed'
  | 'failed'
  | 'cancelled'
  | 'disposed';

export const TERMINAL_PHASES: ReadonlySet<OperationPhase> = new Set([
  'committed',
  'failed',
  'cancelled',
  'disposed'
]);

export const RESERVED_OPERATION_KINDS: readonly OperationKind[] = [
  'trim',
  'close-base',
  'segmentation',
  'movement',
  'ipr',
  'collision',
  'boolean',
  'offset',
  'attachment-placement',
  'margin-detection',
  'model-repair',
  'mesh-healing',
  'custom'
] as const;
