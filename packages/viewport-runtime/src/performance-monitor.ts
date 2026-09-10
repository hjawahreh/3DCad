import type { ViewportMetrics } from './metrics.js';
import type { ViewportDiagnostics } from './diagnostics.js';

export interface PerformanceSample {
  readonly frameMs: number;
  readonly cpuMs: number;
  readonly overBudget: boolean;
}

/**
 * Lightweight performance monitor for frame budget awareness (120 FPS → 8.33 ms).
 */
export class PerformanceMonitor {
  private readonly budgetMs: number;
  private overBudgetCount = 0;

  public constructor(
    targetFps: number,
    private readonly metrics: ViewportMetrics,
    private readonly diagnostics: ViewportDiagnostics
  ) {
    this.budgetMs = 1000 / Math.max(1, targetFps);
  }

  public getBudgetMs(): number {
    return this.budgetMs;
  }

  public observe(input: {
    readonly frameMs: number;
    readonly cpuMs: number;
    readonly presentationLatencyMs: number;
    readonly now: number;
    readonly dropped: boolean;
  }): PerformanceSample {
    const overBudget = input.frameMs > this.budgetMs;
    if (overBudget) {
      this.overBudgetCount += 1;
      this.diagnostics.warn(
        'frame-budget',
        `Frame ${input.frameMs.toFixed(2)}ms exceeded budget ${this.budgetMs.toFixed(2)}ms`,
        input.now
      );
    }
    this.metrics.recordFrame(input);
    this.diagnostics.recordRender(input.presentationLatencyMs, input.dropped);
    return Object.freeze({
      frameMs: input.frameMs,
      cpuMs: input.cpuMs,
      overBudget
    });
  }

  public getOverBudgetCount(): number {
    return this.overBudgetCount;
  }
}
