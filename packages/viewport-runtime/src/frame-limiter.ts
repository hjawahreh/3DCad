/**
 * Frame pacing limiter (min interval between presented frames).
 */
export class FrameLimiter {
  private minIntervalMs: number;
  private lastAcceptedAt = Number.NEGATIVE_INFINITY;

  public constructor(targetFps: number) {
    this.minIntervalMs = 1000 / Math.max(1, targetFps);
  }

  public setTargetFps(fps: number): void {
    this.minIntervalMs = 1000 / Math.max(1, fps);
  }

  public getMinIntervalMs(): number {
    return this.minIntervalMs;
  }

  public shouldAccept(nowMs: number): boolean {
    if (nowMs - this.lastAcceptedAt + 1e-6 < this.minIntervalMs) {
      return false;
    }
    this.lastAcceptedAt = nowMs;
    return true;
  }

  public reset(): void {
    this.lastAcceptedAt = Number.NEGATIVE_INFINITY;
  }
}
