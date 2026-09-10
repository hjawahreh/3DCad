import type { CancellationManager } from './cancellation.js';
import type { CommitCoordinator } from './commit-coordinator.js';
import type { OperationDiagnostics } from './diagnostics.js';
import type { OperationExecutor } from './executor.js';
import type { OperationMetrics } from './metrics.js';
import type { ProgressManager } from './progress.js';
import type { ResultValidator, ValidationPipeline } from './validation.js';

/** Shared services injected into every OperationSession. */
export interface OperationRuntimeServices {
  readonly executor: OperationExecutor;
  readonly validation: ValidationPipeline;
  readonly resultValidator: ResultValidator;
  readonly progress: ProgressManager;
  readonly cancellation: CancellationManager;
  readonly commits: CommitCoordinator;
  readonly diagnostics: OperationDiagnostics;
  readonly metrics: OperationMetrics;
  readonly now: () => number;
}
