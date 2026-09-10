import { EMPTY_MODIFIERS, type MouseButton, type RawPlatformInput } from '@cad-studio/interaction-runtime';
import type { StudioCompositionRoot } from '../application/composition-root.js';

const mapButton = (button: number): MouseButton => {
  switch (button) {
    case 0:
      return 'primary';
    case 1:
      return 'auxiliary';
    case 2:
      return 'secondary';
    case 3:
      return 'back';
    case 4:
      return 'forward';
    default:
      return 'none';
  }
};

const modifiersFrom = (event: MouseEvent | KeyboardEvent | WheelEvent) =>
  Object.freeze({
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey
  });

/**
 * ViewportHost — owns the canvas DOM element and forwards input to Interaction Runtime.
 */
export class ViewportHostController {
  private canvas: HTMLCanvasElement | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private attached = false;

  public constructor(private readonly root: StudioCompositionRoot) {}

  public async mount(canvas: HTMLCanvasElement): Promise<boolean> {
    this.canvas = canvas;
    this.bindInput(canvas);
    const ok = await this.root.attachViewport(canvas);
    this.attached = ok;
    if (ok) {
      this.resizeObserver = new ResizeObserver(() => {
        this.syncSize();
      });
      this.resizeObserver.observe(canvas);
      this.syncSize();
    }
    return ok;
  }

  public unmount(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.canvas = undefined;
    this.attached = false;
  }

  public isAttached(): boolean {
    return this.attached;
  }

  private syncSize(): void {
    const canvas = this.canvas;
    if (canvas === undefined) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    this.root.resizeViewport(width, height);
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const forward = (input: RawPlatformInput): void => {
      this.root.handleRawInput(input);
    };

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      forward({
        kind: 'pointer',
        phase: 'down',
        pointerId: event.pointerId,
        pointerType: event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse',
        position: { x: event.offsetX, y: event.offsetY },
        buttons: event.buttons,
        button: mapButton(event.button),
        modifiers: modifiersFrom(event),
        timestamp: event.timeStamp
      });
    });

    canvas.addEventListener('pointermove', (event) => {
      forward({
        kind: 'pointer',
        phase: 'move',
        pointerId: event.pointerId,
        pointerType: event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse',
        position: { x: event.offsetX, y: event.offsetY },
        buttons: event.buttons,
        button: mapButton(event.button),
        modifiers: modifiersFrom(event),
        timestamp: event.timeStamp
      });
    });

    const end = (event: PointerEvent, phase: 'up' | 'cancel'): void => {
      forward({
        kind: 'pointer',
        phase,
        pointerId: event.pointerId,
        pointerType: event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse',
        position: { x: event.offsetX, y: event.offsetY },
        buttons: event.buttons,
        button: mapButton(event.button),
        modifiers: modifiersFrom(event),
        timestamp: event.timeStamp
      });
    };

    canvas.addEventListener('pointerup', (event) => end(event, 'up'));
    canvas.addEventListener('pointercancel', (event) => end(event, 'cancel'));

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const deltaMode =
        event.deltaMode === 1 ? 'line' : event.deltaMode === 2 ? 'page' : 'pixel';
      forward({
        kind: 'wheel',
        position: { x: event.offsetX, y: event.offsetY },
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        deltaMode,
        modifiers: modifiersFrom(event),
        timestamp: event.timeStamp
      });
    }, { passive: false });

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', (event) => {
      forward({
        kind: 'keyboard',
        phase: event.repeat ? 'repeat' : 'down',
        key: event.key,
        code: event.code,
        modifiers: modifiersFrom(event),
        repeat: event.repeat,
        timestamp: event.timeStamp
      });
    });
    canvas.addEventListener('keyup', (event) => {
      forward({
        kind: 'keyboard',
        phase: 'up',
        key: event.key,
        code: event.code,
        modifiers: modifiersFrom(event),
        repeat: false,
        timestamp: event.timeStamp
      });
    });

    void EMPTY_MODIFIERS;
  }
}
