import type { Size2D } from './types.js';
import type { ViewportLifecyclePhase } from './lifecycle.js';
import type { ViewportBackendKind } from './types.js';

export type ViewportEventType =
  | 'lifecycle'
  | 'resize'
  | 'invalidate'
  | 'frame'
  | 'backend'
  | 'context'
  | 'error'
  | 'warning';

export interface ViewportLifecycleEvent {
  readonly type: 'lifecycle';
  readonly phase: ViewportLifecyclePhase;
  readonly at: number;
}

export interface ViewportResizeEvent {
  readonly type: 'resize';
  readonly size: Size2D;
  readonly devicePixelRatio: number;
  readonly at: number;
}

export interface ViewportInvalidateEvent {
  readonly type: 'invalidate';
  readonly reason: string;
  readonly at: number;
}

export interface ViewportFrameEvent {
  readonly type: 'frame';
  readonly frameNumber: number;
  readonly durationMs: number;
  readonly at: number;
}

export interface ViewportBackendEvent {
  readonly type: 'backend';
  readonly selected: ViewportBackendKind;
  readonly available: readonly ViewportBackendKind[];
  readonly at: number;
}

export interface ViewportContextEvent {
  readonly type: 'context';
  readonly lost: boolean;
  readonly at: number;
}

export interface ViewportErrorEvent {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface ViewportWarningEvent {
  readonly type: 'warning';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export type ViewportEvent =
  | ViewportLifecycleEvent
  | ViewportResizeEvent
  | ViewportInvalidateEvent
  | ViewportFrameEvent
  | ViewportBackendEvent
  | ViewportContextEvent
  | ViewportErrorEvent
  | ViewportWarningEvent;

export type ViewportEventListener = (event: ViewportEvent) => void;

/**
 * Synchronous fan-out event bus for a single viewport session.
 * Ownership: session-owned; listeners must not retain session privately across dispose.
 * Threading: listeners run on the emitting thread; keep handlers non-blocking.
 */
export class ViewportEvents {
  private readonly listeners = new Set<ViewportEventListener>();

  public subscribe(listener: ViewportEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: ViewportEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
