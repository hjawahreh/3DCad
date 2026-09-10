export interface ViewportMetricsSnapshot {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly cpuFrameTimeMs: number;
  readonly presentationLatencyMs: number;
  readonly resizeDurationMs: number;
  readonly frameCount: number;
  readonly averageFrameTimeMs: number;
  readonly worstFrameMs: number;
  readonly bestFrameMs: number;
  readonly droppedFrames: number;
}

/**
 * Rolling viewport performance metrics.
 * Ownership: session-owned mutable accumulator; publish via snapshot().
 */
export class ViewportMetrics {
  private frameCount = 0;
  private totalFrameMs = 0;
  private lastFrameMs = 0;
  private cpuFrameMs = 0;
  private presentationLatencyMs = 0;
  private resizeDurationMs = 0;
  private worstFrameMs = 0;
  private bestFrameMs = Number.POSITIVE_INFINITY;
  private droppedFrames = 0;
  private lastFpsSampleAt = 0;
  private framesInSample = 0;
  private fps = 0;

  public recordFrame(input: {
    readonly frameMs: number;
    readonly cpuMs: number;
    readonly presentationLatencyMs: number;
    readonly now: number;
    readonly dropped: boolean;
  }): void {
    this.frameCount += 1;
    this.lastFrameMs = input.frameMs;
    this.cpuFrameMs = input.cpuMs;
    this.presentationLatencyMs = input.presentationLatencyMs;
    this.totalFrameMs += input.frameMs;
    this.worstFrameMs = Math.max(this.worstFrameMs, input.frameMs);
    this.bestFrameMs = Math.min(this.bestFrameMs, input.frameMs);
    if (input.dropped) {
      this.droppedFrames += 1;
    }
    this.framesInSample += 1;
    if (this.lastFpsSampleAt === 0) {
      this.lastFpsSampleAt = input.now;
    }
    const elapsed = input.now - this.lastFpsSampleAt;
    if (elapsed >= 500) {
      this.fps = (this.framesInSample * 1000) / elapsed;
      this.framesInSample = 0;
      this.lastFpsSampleAt = input.now;
    }
  }

  public recordResize(durationMs: number): void {
    this.resizeDurationMs = durationMs;
  }

  public snapshot(): ViewportMetricsSnapshot {
    return Object.freeze({
      fps: this.fps,
      frameTimeMs: this.lastFrameMs,
      cpuFrameTimeMs: this.cpuFrameMs,
      presentationLatencyMs: this.presentationLatencyMs,
      resizeDurationMs: this.resizeDurationMs,
      frameCount: this.frameCount,
      averageFrameTimeMs: this.frameCount === 0 ? 0 : this.totalFrameMs / this.frameCount,
      worstFrameMs: this.frameCount === 0 ? 0 : this.worstFrameMs,
      bestFrameMs: this.frameCount === 0 ? 0 : this.bestFrameMs,
      droppedFrames: this.droppedFrames
    });
  }

  public reset(): void {
    this.frameCount = 0;
    this.totalFrameMs = 0;
    this.lastFrameMs = 0;
    this.cpuFrameMs = 0;
    this.presentationLatencyMs = 0;
    this.resizeDurationMs = 0;
    this.worstFrameMs = 0;
    this.bestFrameMs = Number.POSITIVE_INFINITY;
    this.droppedFrames = 0;
    this.lastFpsSampleAt = 0;
    this.framesInSample = 0;
    this.fps = 0;
  }
}
