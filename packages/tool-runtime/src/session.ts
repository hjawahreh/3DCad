import type { ProgressReporter } from '@cad-studio/platform-runtime';
import type { CommitReceipt, CommandIntent } from './commit.js';
import type { KernelSuccess } from './kernel-port.js';
import type {
  OperationHandler,
  OperationHandlerContext,
  OperationProgress,
  OperationSnapshot,
  OperationStartInput,
  RunKernelOptions
} from './operation.js';
import type { PreviewDescriptor } from './preview.js';
import type { OperationRuntimeServices } from './services.js';
import {
  asOperationId,
  opFailure,
  opSuccess,
  TERMINAL_PHASES,
  type DocumentRevision,
  type OperationId,
  type OperationKind,
  type OperationPhase,
  type OperationResult,
  type WorkflowStepId
} from './types.js';

let operationSerial = 1;

const canTransition = (from: OperationPhase, to: OperationPhase): boolean => {
  if (from === 'disposed') {
    return false;
  }
  if (to === 'disposed') {
    return true;
  }
  if (to === 'failed' || to === 'cancelled') {
    return !TERMINAL_PHASES.has(from) || from === 'ready-to-commit';
  }
  const allowed: Record<OperationPhase, readonly OperationPhase[]> = {
    created: ['active'],
    active: ['previewing', 'executing', 'validating', 'ready-to-commit', 'cancelled', 'failed'],
    previewing: ['previewing', 'active', 'executing', 'validating', 'cancelled', 'failed'],
    executing: ['validating', 'failed', 'cancelled'],
    validating: ['ready-to-commit', 'failed', 'cancelled'],
    'ready-to-commit': ['committed', 'executing', 'previewing', 'active', 'failed', 'cancelled'],
    committed: ['disposed'],
    failed: ['disposed'],
    cancelled: ['disposed'],
    disposed: []
  };
  return allowed[from].includes(to);
};

export class OperationSession {
  readonly id: OperationId;
  readonly kind: OperationKind;
  readonly name: string;
  readonly baseRevision: DocumentRevision;
  readonly workflowStepId: WorkflowStepId | undefined;
  readonly requiresKernel: boolean;
  readonly undoable: boolean;

  private phase: OperationPhase = 'created';
  private params: Readonly<Record<string, unknown>>;
  private preview: PreviewDescriptor | undefined;
  private progress: OperationProgress = { completed: 0, total: 1 };
  private kernelResult: KernelSuccess | undefined;
  private validationMessage: string | undefined;
  private commitTokenId: string | undefined;
  private failureMessage: string | undefined;
  private readonly controller = new AbortController();
  private readonly listeners = new Set<(snapshot: OperationSnapshot) => void>();
  private readonly startedAt: number;
  private validated = false;

  public constructor(
    input: OperationStartInput,
    private readonly services: OperationRuntimeServices,
    private readonly handler: OperationHandler | undefined
  ) {
    this.id = asOperationId(`op-${String(operationSerial)}`);
    operationSerial += 1;
    this.kind = input.kind;
    this.name = input.name ?? input.kind;
    this.baseRevision = input.baseRevision;
    this.workflowStepId = input.workflowStepId;
    this.params = Object.freeze({ ...(input.params ?? {}) });
    this.requiresKernel = input.requiresKernel ?? true;
    this.undoable = input.undoable ?? true;
    this.startedAt = this.services.now();
    this.services.cancellation.track(this.id, this.controller);
    this.services.metrics.recordStart();
    this.services.diagnostics.record({
      level: 'info',
      operationId: this.id,
      kind: this.kind,
      code: 'op-created',
      message: `Created operation ${this.kind}`
    });
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public snapshot(): OperationSnapshot {
    return {
      id: this.id,
      kind: this.kind,
      name: this.name,
      phase: this.phase,
      baseRevision: this.baseRevision,
      workflowStepId: this.workflowStepId,
      params: this.params,
      preview: this.preview,
      progress: this.progress,
      kernelResult: this.kernelResult,
      validationMessage: this.validationMessage,
      requiresKernel: this.requiresKernel,
      undoable: this.undoable,
      commitTokenId: this.commitTokenId,
      failureMessage: this.failureMessage
    };
  }

  public subscribe(listener: (snapshot: OperationSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public start(): OperationResult<OperationSnapshot> {
    const moved = this.transition('active');
    if (!moved.ok) {
      return moved;
    }
    const pre = this.services.validation.runPreconditions(this.handlerContext());
    if (!pre.ok) {
      this.fail(pre.error.message);
      return pre;
    }
    if (this.handler?.onStart !== undefined) {
      const started = this.handler.onStart(this.handlerContext(), this.params);
      if (!started.ok) {
        this.fail(started.error.message);
        return started;
      }
    }
    return opSuccess(this.snapshot());
  }

  public update(input: Readonly<Record<string, unknown>>): OperationResult<OperationSnapshot> {
    if (this.phase !== 'active' && this.phase !== 'previewing' && this.phase !== 'ready-to-commit') {
      return opFailure('invalid', `Cannot update operation in phase ${this.phase}`);
    }
    this.params = Object.freeze({ ...this.params, ...input });
    this.validated = false;
    if (this.phase === 'ready-to-commit') {
      const moved = this.transition('active');
      if (!moved.ok) {
        return moved;
      }
      this.kernelResult = undefined;
      this.validationMessage = undefined;
    }
    if (this.handler?.onUpdate !== undefined) {
      const updated = this.handler.onUpdate(this.handlerContext(), input);
      if (!updated.ok) {
        this.fail(updated.error.message);
        return updated;
      }
    }
    this.emit();
    return opSuccess(this.snapshot());
  }

  public setPreview(preview: PreviewDescriptor | undefined): OperationResult<OperationSnapshot> {
    if (TERMINAL_PHASES.has(this.phase)) {
      return opFailure('invalid', `Cannot set preview in phase ${this.phase}`);
    }
    this.preview = preview;
    if (this.phase === 'active' || this.phase === 'previewing') {
      const moved = this.transition('previewing');
      if (!moved.ok) {
        return moved;
      }
    }
    this.emit();
    return opSuccess(this.snapshot());
  }

  public async runKernel(options: RunKernelOptions = {}): Promise<OperationResult<OperationSnapshot>> {
    if (this.phase === 'committed' || this.phase === 'disposed' || this.phase === 'cancelled') {
      return opFailure('invalid', `Cannot run kernel in phase ${this.phase}`);
    }
    if (this.controller.signal.aborted) {
      return this.cancel();
    }

    const pre = this.services.validation.runPreconditions(this.handlerContext());
    if (!pre.ok) {
      this.fail(pre.error.message);
      return pre;
    }

    const moved = this.transition('executing');
    if (!moved.ok) {
      return moved;
    }

    const requestResult =
      this.handler?.buildKernelRequest?.(this.handlerContext()) ??
      opSuccess({
        operation: this.kind,
        inputRevision: this.baseRevision,
        payload: { ...this.params, ...(options.payload ?? {}) }
      });

    if (!requestResult.ok) {
      this.fail(requestResult.error.message);
      return requestResult;
    }

    const report: ProgressReporter = (progress) => {
      this.progress = {
        completed: progress.completed,
        ...(progress.total === undefined ? {} : { total: progress.total }),
        ...(progress.message === undefined ? {} : { message: progress.message })
      };
      this.emit();
      options.report?.(progress);
    };

    const kernelResult = await this.services.executor.execute({
      operationId: this.id,
      kind: this.kind,
      request: requestResult.value,
      signal: this.controller.signal,
      report,
      now: this.services.now
    });

    if (!kernelResult.ok) {
      if (kernelResult.error.code === 'cancelled' || this.controller.signal.aborted) {
        return this.cancel();
      }
      this.fail(kernelResult.error.message);
      return kernelResult;
    }

    this.kernelResult = kernelResult.value;
    return this.validate();
  }

  public validate(): OperationResult<OperationSnapshot> {
    if (
      this.phase !== 'executing' &&
      this.phase !== 'validating' &&
      this.phase !== 'previewing' &&
      this.phase !== 'active' &&
      this.phase !== 'ready-to-commit'
    ) {
      return opFailure('invalid', `Cannot validate in phase ${this.phase}`);
    }

    const moved = this.transition('validating');
    if (!moved.ok) {
      return moved;
    }

    const fingerprint = this.services.resultValidator.validate(
      this.kernelResult,
      this.requiresKernel
    );
    if (!fingerprint.ok) {
      this.fail(fingerprint.error.message);
      return fingerprint;
    }

    const pipeline = this.services.validation.runFull(
      this.handlerContext(),
      this.kernelResult,
      this.handler,
      this.requiresKernel
    );
    if (!pipeline.ok) {
      this.fail(pipeline.error.message);
      return pipeline;
    }

    this.validationMessage = 'ok';
    this.validated = true;
    const ready = this.transition('ready-to-commit');
    if (!ready.ok) {
      return ready;
    }
    return opSuccess(this.snapshot());
  }

  public commit(): OperationResult<CommitReceipt> {
    if (this.phase !== 'ready-to-commit') {
      return opFailure(
        'forbidden',
        `Commit denied in phase ${this.phase}; operation must be validated first`
      );
    }

    const intentResult = this.buildIntent();
    if (!intentResult.ok) {
      this.fail(intentResult.error.message);
      return intentResult;
    }

    const issued = this.services.commits.commit({
      operationId: this.id,
      operationKind: this.kind,
      workflowStepId: this.workflowStepId,
      baseRevision: this.baseRevision,
      commandIntent: intentResult.value,
      now: this.services.now(),
      validated: this.validated,
      kernelOk: this.kernelResult !== undefined,
      requiresKernel: this.requiresKernel
    });
    if (!issued.ok) {
      this.fail(issued.error.message);
      return issued;
    }

    this.commitTokenId = issued.value.token.id;
    const moved = this.transition('committed');
    if (!moved.ok) {
      this.services.commits.gateRef.revoke(issued.value.token.id);
      return moved;
    }
    this.services.metrics.recordCommit();
    this.services.metrics.recordSuccess(this.services.now() - this.startedAt);
    this.services.diagnostics.record({
      level: 'info',
      operationId: this.id,
      kind: this.kind,
      code: 'op-committed',
      message: 'Operation committed'
    });
    return issued;
  }

  public cancel(): OperationResult<OperationSnapshot> {
    if (TERMINAL_PHASES.has(this.phase) && this.phase !== 'ready-to-commit') {
      if (this.phase === 'cancelled') {
        return opSuccess(this.snapshot());
      }
      return opFailure('invalid', `Cannot cancel operation in phase ${this.phase}`);
    }
    this.services.cancellation.cancel(this.id);
    this.controller.abort();
    this.failureMessage = 'cancelled';
    this.validated = false;
    const moved = this.transition('cancelled');
    if (!moved.ok) {
      return moved;
    }
    this.services.metrics.recordCancel();
    this.services.diagnostics.record({
      level: 'warn',
      operationId: this.id,
      kind: this.kind,
      code: 'op-cancelled',
      message: 'Operation cancelled'
    });
    return opSuccess(this.snapshot());
  }

  public dispose(): void {
    if (this.phase !== 'disposed') {
      this.controller.abort();
      this.phase = 'disposed';
      this.preview = undefined;
      this.services.cancellation.release(this.id);
      this.services.progress.clear(this.id);
      this.emit();
      this.listeners.clear();
    }
  }

  private buildIntent(): OperationResult<CommandIntent> {
    if (this.handler?.buildCommandIntent !== undefined) {
      return this.handler.buildCommandIntent(this.handlerContext(), this.kernelResult);
    }
    return opSuccess({
      name: `${this.kind}.commit`,
      operationId: this.id,
      operationKind: this.kind,
      baseRevision: this.baseRevision,
      payload: {
        params: this.params,
        ...(this.kernelResult === undefined ? {} : { kernel: this.kernelResult.payload })
      },
      ...(this.kernelResult === undefined
        ? {}
        : { kernelFingerprint: this.kernelResult.fingerprint }),
      undoable: this.undoable
    });
  }

  private fail(message: string): void {
    this.failureMessage = message;
    this.validated = false;
    if (!TERMINAL_PHASES.has(this.phase)) {
      this.phase = 'failed';
      this.services.metrics.recordFailure();
      this.services.diagnostics.record({
        level: 'error',
        operationId: this.id,
        kind: this.kind,
        code: 'op-failed',
        message
      });
      this.emit();
    }
  }

  private transition(to: OperationPhase): OperationResult<void> {
    if (!canTransition(this.phase, to)) {
      return opFailure('invalid', `Illegal transition ${this.phase} → ${to}`);
    }
    this.phase = to;
    this.emit();
    return opSuccess(undefined);
  }

  private handlerContext(): OperationHandlerContext {
    return {
      id: this.id,
      kind: this.kind,
      baseRevision: this.baseRevision,
      params: this.params,
      preview: this.preview,
      setPreview: (preview) => {
        this.preview = preview;
        if (this.phase === 'active') {
          this.phase = 'previewing';
        }
        this.emit();
      },
      report: (progress) => {
        this.progress = progress;
        this.emit();
      }
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}
