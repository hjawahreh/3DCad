/**
 * ClinicalOrientationGizmo — interactive handle model for Interaction Runtime.
 */

import type { OrientationAxis, OrientationHandle } from './ClinicalOrientationState.js';

export interface GizmoDragState {
  readonly active: boolean;
  readonly handle: OrientationHandle;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly lastX: number;
  readonly lastY: number;
  readonly owner: string;
}

export class ClinicalOrientationGizmo {
  public static readonly OWNER = 'clinical-orientation-gizmo';

  private drag: GizmoDragState | undefined;
  private readonly listeners = new Set<() => void>();

  public getDrag(): GizmoDragState | undefined {
    return this.drag;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public beginDrag(input: {
    readonly handle: OrientationHandle;
    readonly pointerId: number;
    readonly x: number;
    readonly y: number;
  }): GizmoDragState {
    this.drag = Object.freeze({
      active: true,
      handle: input.handle,
      pointerId: input.pointerId,
      startX: input.x,
      startY: input.y,
      lastX: input.x,
      lastY: input.y,
      owner: ClinicalOrientationGizmo.OWNER
    });
    this.emit();
    return this.drag;
  }

  public moveDrag(x: number, y: number): GizmoDragState | undefined {
    if (this.drag === undefined) {
      return undefined;
    }
    this.drag = Object.freeze({
      ...this.drag,
      lastX: x,
      lastY: y
    });
    this.emit();
    return this.drag;
  }

  public endDrag(): GizmoDragState | undefined {
    const ended = this.drag;
    this.drag = undefined;
    this.emit();
    return ended;
  }

  public axisForHandle(handle: OrientationHandle): OrientationAxis {
    if (handle === 'x' || handle === 'y' || handle === 'z') {
      return handle;
    }
    return 'free';
  }

  /**
   * Convert screen-space drag delta to degrees.
   * Horizontal drag → primary rotation; sensitivity tuned for clinical feel.
   */
  public deltaDegrees(drag: GizmoDragState, sensitivity = 0.35): number {
    const dx = drag.lastX - drag.startX;
    const dy = drag.lastY - drag.startY;
    if (drag.handle === 'y') {
      return dx * sensitivity;
    }
    if (drag.handle === 'x') {
      return -dy * sensitivity;
    }
    if (drag.handle === 'z') {
      return (dx + dy) * sensitivity * 0.5;
    }
    return dx * sensitivity;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
