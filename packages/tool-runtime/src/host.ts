import { CancellationManager } from './cancellation.js';
import { CommitGate } from './commit.js';
import { CommitCoordinator } from './commit-coordinator.js';
import { OperationDiagnostics } from './diagnostics.js';
import { OperationExecutor } from './executor.js';
import type { KernelPort } from './kernel-port.js';
import { OperationMetrics } from './metrics.js';
import type { OperationHandler, OperationStartInput } from './operation.js';
import { ProgressManager } from './progress.js';
import { OperationRegistry } from './registry.js';
import { DEFAULT_RETRY_POLICY, RetryPolicy, type RetryPolicyConfig } from './retry.js';
import type { OperationRuntimeServices } from './services.js';
import { OperationSession } from './session.js';
import {
  opFailure,
  opSuccess,
  RESERVED_OPERATION_KINDS,
  type OperationKind,
  type OperationResult
} from './types.js';
import { ResultValidator, ValidationPipeline } from './validation.js';
import { WorkflowGate } from './workflow-gate.js';

export interface OperationHostOptions {
  readonly kernel: KernelPort;
  readonly commits?: CommitGate;
  readonly now?: () => number;
  readonly retry?: RetryPolicyConfig;
}

/**
 * Composition-facing Operation Runtime host.
 * Wires registry, executor, validation, progress, cancellation, retry, commit, diagnostics, metrics.
 */
export class OperationHost {
  private readonly registry = new OperationRegistry();
  private readonly commits: CommitCoordinator;
  private readonly workflow: WorkflowGate;
  private readonly progress = new ProgressManager();
  private readonly cancellation = new CancellationManager();
  private readonly validation = new ValidationPipeline();
  private readonly resultValidator = new ResultValidator();
  private readonly diagnostics = new OperationDiagnostics();
  private readonly metrics = new OperationMetrics();
  private readonly retry: RetryPolicy;
  private readonly executor: OperationExecutor;
  private readonly services: OperationRuntimeServices;
  private active: OperationSession | undefined;

  public constructor(options: OperationHostOptions) {
    const gate = options.commits ?? new CommitGate();
    this.commits = new CommitCoordinator(gate);
    this.workflow = new WorkflowGate(gate);
    this.retry = new RetryPolicy(options.retry ?? DEFAULT_RETRY_POLICY);
    this.executor = new OperationExecutor(
      options.kernel,
      this.retry,
      this.progress,
      this.cancellation,
      this.metrics,
      this.diagnostics,
      this.validation
    );
    const now = options.now ?? (() => Date.now());
    this.services = {
      executor: this.executor,
      validation: this.validation,
      resultValidator: this.resultValidator,
      progress: this.progress,
      cancellation: this.cancellation,
      commits: this.commits,
      diagnostics: this.diagnostics,
      metrics: this.metrics,
      now
    };
  }

  public get commitGate(): CommitGate {
    return this.commits.gateRef;
  }

  public get workflowGate(): WorkflowGate {
    return this.workflow;
  }

  public get operationRegistry(): OperationRegistry {
    return this.registry;
  }

  public get validationPipeline(): ValidationPipeline {
    return this.validation;
  }

  public get operationMetrics(): OperationMetrics {
    return this.metrics;
  }

  public get operationDiagnostics(): OperationDiagnostics {
    return this.diagnostics;
  }

  public get supportedKinds(): readonly OperationKind[] {
    return this.registry.kinds().length > 0 ? this.registry.kinds() : RESERVED_OPERATION_KINDS;
  }

  public registerHandler(handler: OperationHandler): OperationResult<void> {
    return this.registry.registerHandler(handler);
  }

  public getActive(): OperationSession | undefined {
    return this.active;
  }

  public start(input: OperationStartInput): OperationResult<OperationSession> {
    if (!this.registry.has(input.kind)) {
      return opFailure('invalid', `Unknown operation kind ${input.kind}`);
    }
    if (this.active !== undefined && !isTerminal(this.active.snapshot().phase)) {
      return opFailure(
        'conflict',
        `Operation ${this.active.id} is still active; cancel or commit it first`
      );
    }
    if (this.active !== undefined) {
      this.active.dispose();
      this.active = undefined;
    }

    const registration = this.registry.get(input.kind);
    const session = new OperationSession(
      {
        ...input,
        requiresKernel: input.requiresKernel ?? registration?.requiresKernel ?? true,
        undoable: input.undoable ?? registration?.undoable ?? true
      },
      this.services,
      this.registry.getHandler(input.kind)
    );
    const started = session.start();
    if (!started.ok) {
      session.dispose();
      return started;
    }
    this.active = session;
    return opSuccess(session);
  }

  public cancelActive(): OperationResult<void> {
    if (this.active === undefined) {
      return opFailure('not-found', 'No active operation');
    }
    const cancelled = this.active.cancel();
    if (!cancelled.ok) {
      return cancelled;
    }
    this.active.dispose();
    this.active = undefined;
    return opSuccess(undefined);
  }

  public clearActiveIfTerminal(): void {
    if (this.active === undefined) {
      return;
    }
    if (isTerminal(this.active.snapshot().phase)) {
      this.active.dispose();
      this.active = undefined;
    }
  }
}

const isTerminal = (phase: string): boolean =>
  phase === 'committed' || phase === 'failed' || phase === 'cancelled' || phase === 'disposed';
