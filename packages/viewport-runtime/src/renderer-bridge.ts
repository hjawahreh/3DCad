import {
  createRenderer,
  type BackendKind,
  type GpuCapabilities,
  type Renderer,
  type Size2D
} from '@cad-studio/viewport';
import type { SceneSnapshot } from '@cad-studio/scene';
import type { ViewportCanvasElement } from './types.js';
import { viewportFailure, viewportSuccess, type ViewportResult } from './types.js';

export interface RendererSubmitResult {
  readonly frameAccepted: boolean;
  readonly sceneRevision: number;
  readonly documentRevision: number;
  readonly renderableCount: number;
}

/**
 * Host wrapper around a Graphics Engine Renderer instance.
 * Ownership: owns the Renderer until dispose; never exposes Three.js objects.
 */
export class RendererHost {
  private renderer: Renderer | undefined;

  public getRenderer(): Renderer | undefined {
    return this.renderer;
  }

  public async attach(renderer: Renderer): Promise<void> {
    this.renderer = renderer;
  }

  public resize(size: Size2D): ViewportResult<void> {
    if (this.renderer === undefined) {
      return viewportFailure('unavailable', 'Renderer not attached');
    }
    const result = this.renderer.resize(size);
    if (!result.ok) {
      return viewportFailure('backend', result.error.message, result.error);
    }
    return viewportSuccess(undefined);
  }

  public renderFrame(): ViewportResult<void> {
    if (this.renderer === undefined) {
      return viewportFailure('unavailable', 'Renderer not attached');
    }
    const result = this.renderer.renderFrame();
    if (!result.ok) {
      return viewportFailure('backend', result.error.message, result.error);
    }
    return viewportSuccess(undefined);
  }

  public backendKind(): BackendKind | undefined {
    return this.renderer?.backend.kind;
  }

  public dispose(): void {
    this.renderer?.dispose();
    this.renderer = undefined;
  }
}

/**
 * RendererBridge coordinates SceneSnapshot submission to the Graphics Engine.
 * It never creates render objects or Three.js scene graphs.
 * Submission records the immutable snapshot revision and requests a Graphics Engine frame.
 *
 * Failure modes: unavailable (no renderer), backend errors from Graphics Engine, cancelled.
 * Threading: call on the viewport owning thread only.
 */
export class RendererBridge {
  private readonly host = new RendererHost();
  private lastSubmitted: SceneSnapshot | undefined;
  private submitCount = 0;

  public getHost(): RendererHost {
    return this.host;
  }

  public async createRenderer(input: {
    readonly canvas?: ViewportCanvasElement;
    readonly forceBackend: BackendKind;
    readonly capabilities?: GpuCapabilities;
    readonly size: Size2D;
    readonly clearColor: readonly [number, number, number, number];
    readonly signal?: AbortSignal;
  }): Promise<ViewportResult<Renderer>> {
    if (input.signal?.aborted === true) {
      return viewportFailure('cancelled', 'Renderer creation cancelled');
    }
    const canvas =
      input.canvas !== undefined ? (input.canvas as HTMLCanvasElement) : undefined;
    const result = await createRenderer({
      forceBackend: input.forceBackend,
      ...(canvas !== undefined ? { canvas } : {}),
      ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
      canvasSize: input.size,
      clearColor: {
        r: input.clearColor[0],
        g: input.clearColor[1],
        b: input.clearColor[2],
        a: input.clearColor[3]
      }
    });
    if (!result.ok) {
      return viewportFailure('backend', result.error.message, result.error);
    }
    await this.host.attach(result.value);
    return viewportSuccess(result.value);
  }

  /**
   * Submit an immutable scene snapshot for presentation.
   * Does not instantiate geometry; Graphics Engine consumes the frame request.
   */
  public submit(snapshot: SceneSnapshot): ViewportResult<RendererSubmitResult> {
    this.lastSubmitted = snapshot;
    this.submitCount += 1;
    const render = this.host.renderFrame();
    if (!render.ok) {
      return render;
    }
    return viewportSuccess(
      Object.freeze({
        frameAccepted: true,
        sceneRevision: snapshot.sceneRevision,
        documentRevision: snapshot.documentRevision,
        renderableCount: snapshot.renderables.length
      })
    );
  }

  public lastSnapshot(): SceneSnapshot | undefined {
    return this.lastSubmitted;
  }

  public getSubmitCount(): number {
    return this.submitCount;
  }

  public resize(size: Size2D): ViewportResult<void> {
    return this.host.resize(size);
  }

  public dispose(): void {
    this.host.dispose();
    this.lastSubmitted = undefined;
  }
}
