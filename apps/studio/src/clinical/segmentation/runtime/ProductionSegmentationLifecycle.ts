/**
 * CLN-SEG-002 — authoritative production segmentation lifecycle.
 *
 * Orthogonal to the internal SegmentationPhase workflow: this enum is the
 * clinician/review-facing production honesty contract. Reference heuristic
 * runs must NEVER be represented as production COMPLETED/ACCEPTED here.
 */

export type ProductionSegmentationLifecycleState =
  | 'NOT_CONFIGURED'
  | 'INITIALIZING'
  | 'READY'
  | 'INFERENCING'
  | 'COMPLETED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'FAILED'
  | 'STALE';

const TRANSITIONS: Readonly<
  Record<ProductionSegmentationLifecycleState, readonly ProductionSegmentationLifecycleState[]>
> = Object.freeze({
  NOT_CONFIGURED: Object.freeze(['INITIALIZING', 'NOT_CONFIGURED'] as const),
  INITIALIZING: Object.freeze(['READY', 'FAILED', 'NOT_CONFIGURED'] as const),
  READY: Object.freeze(['INFERENCING', 'NOT_CONFIGURED', 'STALE', 'FAILED'] as const),
  INFERENCING: Object.freeze(['COMPLETED', 'FAILED', 'REJECTED'] as const),
  COMPLETED: Object.freeze(['ACCEPTED', 'REJECTED', 'STALE', 'INFERENCING', 'READY'] as const),
  ACCEPTED: Object.freeze(['STALE', 'READY', 'NOT_CONFIGURED'] as const),
  REJECTED: Object.freeze(['READY', 'NOT_CONFIGURED', 'INFERENCING', 'INITIALIZING'] as const),
  FAILED: Object.freeze(['READY', 'NOT_CONFIGURED', 'INITIALIZING', 'INFERENCING'] as const),
  STALE: Object.freeze(['READY', 'INFERENCING', 'NOT_CONFIGURED', 'INITIALIZING'] as const)
});

/** Hard ceiling so UI can never stay on Preparing forever. */
export const PRODUCTION_INFERENCE_WATCHDOG_MS = 180_000;

export type ProductionReviewStatusKind =
  | 'no-model'
  | 'model-loading'
  | 'model-ready'
  | 'inference-running'
  | 'inference-failed'
  | 'inference-completed'
  | 'accepted'
  | 'rejected'
  | 'stale';

export const productionLifecycleToReviewKind = (
  state: ProductionSegmentationLifecycleState
): ProductionReviewStatusKind => {
  switch (state) {
    case 'NOT_CONFIGURED':
      return 'no-model';
    case 'INITIALIZING':
      return 'model-loading';
    case 'READY':
      return 'model-ready';
    case 'INFERENCING':
      return 'inference-running';
    case 'FAILED':
      return 'inference-failed';
    case 'COMPLETED':
      return 'inference-completed';
    case 'ACCEPTED':
      return 'accepted';
    case 'REJECTED':
      return 'rejected';
    case 'STALE':
      return 'stale';
  }
};

export const productionLifecycleUiLabel = (
  state: ProductionSegmentationLifecycleState
): string => {
  switch (state) {
    case 'NOT_CONFIGURED':
      return 'Production Model Not Configured';
    case 'INITIALIZING':
      return 'Loading production model…';
    case 'READY':
      return 'Production model ready';
    case 'INFERENCING':
      return 'Inference running…';
    case 'COMPLETED':
      return 'Inference completed — review required';
    case 'ACCEPTED':
      return 'Segmentation accepted';
    case 'REJECTED':
      return 'Segmentation rejected';
    case 'FAILED':
      return 'Inference failed';
    case 'STALE':
      return 'Segmentation outdated — geometry changed';
  }
};

export class ProductionSegmentationLifecycle {
  private state: ProductionSegmentationLifecycleState = 'NOT_CONFIGURED';
  private detail: string | undefined;
  private inferStartedAt: number | undefined;

  public getState(): ProductionSegmentationLifecycleState {
    return this.state;
  }

  public getDetail(): string | undefined {
    return this.detail;
  }

  public getInferStartedAt(): number | undefined {
    return this.inferStartedAt;
  }

  public reset(to: ProductionSegmentationLifecycleState = 'NOT_CONFIGURED'): void {
    this.state = to;
    this.detail = undefined;
    this.inferStartedAt = undefined;
  }

  public force(next: ProductionSegmentationLifecycleState, detail?: string): void {
    this.state = next;
    this.detail = detail;
    if (next === 'INFERENCING') {
      this.inferStartedAt = Date.now();
    } else if (next !== 'COMPLETED' && next !== 'FAILED') {
      this.inferStartedAt = undefined;
    }
  }

  public transition(next: ProductionSegmentationLifecycleState, detail?: string): boolean {
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      return false;
    }
    this.state = next;
    this.detail = detail;
    if (next === 'INFERENCING') {
      this.inferStartedAt = Date.now();
    }
    if (next === 'COMPLETED' || next === 'FAILED' || next === 'REJECTED' || next === 'ACCEPTED') {
      // keep inferStartedAt for diagnostics until next INFERENCING
    }
    if (next === 'READY' || next === 'NOT_CONFIGURED' || next === 'STALE') {
      this.inferStartedAt = undefined;
    }
    return true;
  }

  /** Fail if inference has been stuck past the watchdog. */
  public checkWatchdog(now = Date.now()): boolean {
    if (this.state !== 'INFERENCING' || this.inferStartedAt === undefined) {
      return false;
    }
    if (now - this.inferStartedAt < PRODUCTION_INFERENCE_WATCHDOG_MS) {
      return false;
    }
    this.state = 'FAILED';
    this.detail = `Inference watchdog exceeded (${String(PRODUCTION_INFERENCE_WATCHDOG_MS / 1000)}s) — refusing stale preparing state`;
    return true;
  }
}

/**
 * Resolve production lifecycle from gate + worker + document integrity.
 * Does not invent production COMPLETED from reference-heuristic predictions.
 */
export const resolveProductionLifecycleBootstrap = (input: {
  readonly providerId: string;
  readonly productionOperational: boolean;
  readonly productionConfigured: boolean;
  readonly documentStatus?: 'CURRENT' | 'STALE' | 'INVALID' | 'NOT_AVAILABLE';
  readonly isHeuristicProvider: boolean;
}): ProductionSegmentationLifecycleState => {
  if (input.documentStatus === 'STALE') {
    return 'STALE';
  }
  if (input.isHeuristicProvider || input.providerId === 'reference-heuristic') {
    return 'NOT_CONFIGURED';
  }
  if (!input.productionConfigured) {
    return 'NOT_CONFIGURED';
  }
  if (!input.productionOperational) {
    return 'NOT_CONFIGURED';
  }
  if (input.documentStatus === 'CURRENT') {
    return 'ACCEPTED';
  }
  return 'READY';
};
