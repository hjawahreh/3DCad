import type { Size2D } from '../types.js';

export type CanvasResizeListener = (size: Size2D) => void;

export interface HostCanvasLike {
  width: number;
  height: number;
  clientWidth?: number;
  clientHeight?: number;
}

export class CanvasHost {
  private canvas: HostCanvasLike | undefined;
  private onResize: CanvasResizeListener | undefined;
  private size: Size2D = { width: 1, height: 1 };

  public attach(
    canvas: HostCanvasLike | HTMLCanvasElement,
    onResize?: CanvasResizeListener
  ): void {
    this.canvas = canvas;
    this.onResize = onResize;
    this.size = this.readSize(canvas);
  }

  public detach(): void {
    this.canvas = undefined;
    this.onResize = undefined;
  }

  public getCanvas(): HostCanvasLike | undefined {
    return this.canvas;
  }

  public getSize(): Size2D {
    return { ...this.size };
  }

  public setSize(size: Size2D): void {
    const next = {
      width: Math.max(1, size.width),
      height: Math.max(1, size.height)
    };
    const changed =
      next.width !== this.size.width || next.height !== this.size.height;
    this.size = next;
    if (this.canvas !== undefined) {
      this.canvas.width = next.width;
      this.canvas.height = next.height;
    }
    if (changed) {
      this.onResize?.(next);
    }
  }

  private readSize(canvas: HostCanvasLike): Size2D {
    const width =
      canvas.clientWidth !== undefined && canvas.clientWidth > 0
        ? canvas.clientWidth
        : Math.max(1, canvas.width);
    const height =
      canvas.clientHeight !== undefined && canvas.clientHeight > 0
        ? canvas.clientHeight
        : Math.max(1, canvas.height);
    return { width, height };
  }
}
