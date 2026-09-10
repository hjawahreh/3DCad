import type { CanvasHost } from './canvas-host.js';
import type { DevicePixelInfo, Size2D } from './types.js';

/**
 * Coalesces resize observations into a single pending size for the next frame.
 * Ownership: session-owned.
 */
export class ViewportResizeManager {
  private pending: Size2D | undefined;
  private lastInfo: DevicePixelInfo | undefined;
  private resizeCount = 0;

  public constructor(private readonly canvasHost: CanvasHost) {}

  public requestResize(size: Size2D): void {
    this.pending = {
      width: Math.max(1, size.width),
      height: Math.max(1, size.height)
    };
  }

  public hasPending(): boolean {
    return this.pending !== undefined;
  }

  public process(): DevicePixelInfo | undefined {
    if (this.pending === undefined) {
      return undefined;
    }
    const size = this.pending;
    this.pending = undefined;
    this.resizeCount += 1;
    this.lastInfo = this.canvasHost.resize(size);
    return this.lastInfo;
  }

  public getResizeCount(): number {
    return this.resizeCount;
  }

  public getLastInfo(): DevicePixelInfo | undefined {
    return this.lastInfo;
  }

  public clear(): void {
    this.pending = undefined;
  }
}
