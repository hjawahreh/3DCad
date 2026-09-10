import type { FrameClock, RenderMode } from './types.js';
import { FrameLimiter } from './frame-limiter.js';

export type FrameSchedulerCallback = (timeMs: number) => void;

/**
 * Demand-driven / continuous / idle frame scheduler.
 * No busy loops — uses injectable FrameClock (rAF by default).
 * Ownership: session-owned; cancel on pause/shutdown.
 */
export class FrameScheduler {
  private mode: RenderMode = 'on-demand';
  private handle: number | undefined;
  private running = false;
  private readonly limiter: FrameLimiter;
  private idleLimiter: FrameLimiter;
  private callback: FrameSchedulerCallback | undefined;
  private needsFrame = false;

  public constructor(
    private readonly clock: FrameClock,
    targetFps: number,
    idleFps: number
  ) {
    this.limiter = new FrameLimiter(targetFps);
    this.idleLimiter = new FrameLimiter(idleFps);
  }

  public setMode(mode: RenderMode): void {
    this.mode = mode;
  }

  public getMode(): RenderMode {
    return this.mode;
  }

  public setTargetFps(fps: number): void {
    this.limiter.setTargetFps(fps);
  }

  public setIdleFps(fps: number): void {
    this.idleLimiter.setTargetFps(fps);
  }

  public requestFrame(): void {
    this.needsFrame = true;
    this.ensureScheduled();
  }

  public start(callback: FrameSchedulerCallback): void {
    this.callback = callback;
    this.running = true;
    if (this.mode === 'continuous' || this.mode === 'idle' || this.needsFrame) {
      this.ensureScheduled();
    }
  }

  public stop(): void {
    this.running = false;
    this.cancelScheduled();
  }

  public isRunning(): boolean {
    return this.running;
  }

  private ensureScheduled(): void {
    if (!this.running || this.handle !== undefined || this.callback === undefined) {
      return;
    }
    this.handle = this.clock.requestFrame((timeMs) => {
      this.handle = undefined;
      this.onTick(timeMs);
    });
  }

  private cancelScheduled(): void {
    if (this.handle === undefined) {
      return;
    }
    this.clock.cancelFrame(this.handle);
    this.handle = undefined;
  }

  private onTick(timeMs: number): void {
    if (!this.running || this.callback === undefined) {
      return;
    }

    const limiter = this.mode === 'idle' ? this.idleLimiter : this.limiter;
    const shouldRender =
      this.mode === 'continuous' || this.mode === 'idle'
        ? limiter.shouldAccept(timeMs)
        : this.needsFrame && limiter.shouldAccept(timeMs);

    if (shouldRender) {
      this.needsFrame = false;
      this.callback(timeMs);
    } else if (this.mode === 'on-demand' && this.needsFrame) {
      // Throttled; keep requesting until accepted.
      this.ensureScheduled();
      return;
    }

    if (
      this.running &&
      (this.mode === 'continuous' || this.mode === 'idle' || this.needsFrame)
    ) {
      this.ensureScheduled();
    }
  }
}
