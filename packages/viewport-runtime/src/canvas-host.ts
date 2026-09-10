import type {
  DevicePixelInfo,
  Size2D,
  ViewportCanvasElement
} from './types.js';

export type CanvasVisibilityListener = (visible: boolean) => void;
export type CanvasContextListener = (lost: boolean) => void;
export type CanvasResizeListener = (info: DevicePixelInfo) => void;

/**
 * Runtime canvas attachment host (DOM-agnostic).
 * Does not create React trees or GPU contexts.
 * Ownership: caller owns the canvas element; host only observes/sizes.
 */
export class CanvasHost {
  private canvas: ViewportCanvasElement | undefined;
  private respectDpr = true;
  private visible = true;
  private fullscreen = false;
  private contextLost = false;
  private devicePixelRatio = 1;
  private size: Size2D = { width: 1, height: 1 };
  private onResize: CanvasResizeListener | undefined;
  private onVisibility: CanvasVisibilityListener | undefined;
  private onContext: CanvasContextListener | undefined;
  private readonly contextLostHandler = (): void => {
    this.contextLost = true;
    this.onContext?.(true);
  };
  private readonly contextRestoredHandler = (): void => {
    this.contextLost = false;
    this.onContext?.(false);
  };

  public configure(options: { readonly respectDevicePixelRatio: boolean }): void {
    this.respectDpr = options.respectDevicePixelRatio;
  }

  public attach(
    canvas: ViewportCanvasElement,
    listeners?: {
      readonly onResize?: CanvasResizeListener;
      readonly onVisibility?: CanvasVisibilityListener;
      readonly onContext?: CanvasContextListener;
    }
  ): void {
    this.detach();
    this.canvas = canvas;
    this.onResize = listeners?.onResize;
    this.onVisibility = listeners?.onVisibility;
    this.onContext = listeners?.onContext;
    if (typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost', this.contextLostHandler);
      canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler);
    }
    this.syncFromCanvas();
  }

  public detach(): void {
    if (this.canvas !== undefined && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
      this.canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
    }
    this.canvas = undefined;
    this.onResize = undefined;
    this.onVisibility = undefined;
    this.onContext = undefined;
    this.contextLost = false;
  }

  public getCanvas(): ViewportCanvasElement | undefined {
    return this.canvas;
  }

  public getSize(): Size2D {
    return { ...this.size };
  }

  public getDevicePixelInfo(): DevicePixelInfo {
    const dpr = this.respectDpr ? this.devicePixelRatio : 1;
    return Object.freeze({
      cssWidth: this.size.width,
      cssHeight: this.size.height,
      devicePixelRatio: dpr,
      bufferWidth: Math.max(1, Math.round(this.size.width * dpr)),
      bufferHeight: Math.max(1, Math.round(this.size.height * dpr))
    });
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public isFullscreen(): boolean {
    return this.fullscreen;
  }

  public isContextLost(): boolean {
    return this.contextLost;
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    this.onVisibility?.(visible);
  }

  public setFullscreen(fullscreen: boolean): void {
    this.fullscreen = fullscreen;
  }

  public setDevicePixelRatio(dpr: number): void {
    this.devicePixelRatio = Math.max(0.5, dpr);
    this.applyBufferSize();
  }

  public resize(size: Size2D): DevicePixelInfo {
    this.size = {
      width: Math.max(1, size.width),
      height: Math.max(1, size.height)
    };
    return this.applyBufferSize();
  }

  public syncFromCanvas(): DevicePixelInfo {
    if (this.canvas === undefined) {
      return this.getDevicePixelInfo();
    }
    const width =
      this.canvas.clientWidth !== undefined && this.canvas.clientWidth > 0
        ? this.canvas.clientWidth
        : Math.max(1, this.canvas.width);
    const height =
      this.canvas.clientHeight !== undefined && this.canvas.clientHeight > 0
        ? this.canvas.clientHeight
        : Math.max(1, this.canvas.height);
    this.size = { width, height };
    if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
      this.devicePixelRatio = window.devicePixelRatio;
    }
    return this.applyBufferSize();
  }

  public notifyContextLost(): void {
    this.contextLostHandler();
  }

  public notifyContextRestored(): void {
    this.contextRestoredHandler();
  }

  private applyBufferSize(): DevicePixelInfo {
    const info = this.getDevicePixelInfo();
    if (this.canvas !== undefined) {
      this.canvas.width = info.bufferWidth;
      this.canvas.height = info.bufferHeight;
    }
    this.onResize?.(info);
    return info;
  }
}
