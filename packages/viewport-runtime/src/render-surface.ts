import type { Size2D } from './types.js';

/**
 * Logical render surface dimensions for the active session.
 * Ownership: session-owned; mirrors CanvasHost buffer size after resize.
 */
export class RenderSurface {
  private size: Size2D = { width: 1, height: 1 };
  private devicePixelRatio = 1;

  public set(size: Size2D, devicePixelRatio: number): void {
    this.size = {
      width: Math.max(1, size.width),
      height: Math.max(1, size.height)
    };
    this.devicePixelRatio = Math.max(0.5, devicePixelRatio);
  }

  public getSize(): Size2D {
    return { ...this.size };
  }

  public getDevicePixelRatio(): number {
    return this.devicePixelRatio;
  }
}
