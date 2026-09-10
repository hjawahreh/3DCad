import type { ProgressReporter } from '@cad-studio/platform-runtime';
import type { CommandIntent } from './commit.js';
import type { KernelRequest, KernelSuccess } from './kernel-port.js';
import type { PreviewDescriptor } from './preview.js';
import type {
  DocumentRevision,
  OperationId,
  OperationKind,
  OperationPhase,
  OperationResult,
  WorkflowStepId
} from './types.js';

export interface OperationProgress {
  readonly completed: number;
  readonly total?: number;
  readonly message?: string;
}

export interface ValidatedOperationResult {
  readonly kernel: KernelSuccess;
  readonly commandIntent: CommandIntent;
}

export interface OperationDefinition {
  readonly kind: OperationKind;
  readonly name: string;
  /** When true, commit requires a successful kernel + validate cycle. */
  readonly requiresKernel: boolean;
  readonly undoable: boolean;
}

export interface OperationStartInput {
  readonly kind: OperationKind;
  readonly name?: string;
  readonly baseRevision: DocumentRevision;
  readonly workflowStepId?: WorkflowStepId;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly requiresKernel?: boolean;
  readonly undoable?: boolean;
}

export interface OperationSnapshot {
  readonly id: OperationId;
  readonly kind: OperationKind;
  readonly name: string;
  readonly phase: OperationPhase;
  readonly baseRevision: DocumentRevision;
  readonly workflowStepId: WorkflowStepId | undefined;
  readonly params: Readonly<Record<string, unknown>>;
  readonly preview: PreviewDescriptor | undefined;
  readonly progress: OperationProgress;
  readonly kernelResult: KernelSuccess | undefined;
  readonly validationMessage: string | undefined;
  readonly requiresKernel: boolean;
  readonly undoable: boolean;
  readonly commitTokenId: string | undefined;
  readonly failureMessage: string | undefined;
}

/**
 * Pluggable behavior for a kind. Clinical packages supply these;
 * the host only orchestrates lifecycle and the commit gate.
 */
export interface OperationHandler {
  readonly kind: OperationKind;
  onStart?(
    session: OperationHandlerContext,
    params: Readonly<Record<string, unknown>>
  ): OperationResult<void>;
  onUpdate?(
    session: OperationHandlerContext,
    input: Readonly<Record<string, unknown>>
  ): OperationResult<void>;
  buildKernelRequest?(
    session: OperationHandlerContext
  ): OperationResult<KernelRequest>;
  validate?(
    session: OperationHandlerContext,
    kernel: KernelSuccess | undefined
  ): OperationResult<void>;
  buildCommandIntent?(
    session: OperationHandlerContext,
    kernel: KernelSuccess | undefined
  ): OperationResult<CommandIntent>;
}

export interface OperationHandlerContext {
  readonly id: OperationId;
  readonly kind: OperationKind;
  readonly baseRevision: DocumentRevision;
  readonly params: Readonly<Record<string, unknown>>;
  readonly preview: PreviewDescriptor | undefined;
  setPreview(preview: PreviewDescriptor | undefined): void;
  report(progress: OperationProgress): void;
}

export type OperationListener = (snapshot: OperationSnapshot) => void;

export interface RunKernelOptions {
  readonly report?: ProgressReporter;
  readonly payload?: Readonly<Record<string, unknown>>;
}
