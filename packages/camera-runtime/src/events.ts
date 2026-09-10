import type { CameraSnapshot } from './state.js';
import type { ProjectionMode, PresetView, Size2D } from './types.js';

export type CameraEventType =
  | 'lifecycle'
  | 'navigate'
  | 'projection'
  | 'sync'
  | 'animation'
  | 'constraint'
  | 'error'
  | 'warning';

export interface CameraLifecycleEvent {
  readonly type: 'lifecycle';
  readonly phase: string;
  readonly at: number;
}

export interface CameraNavigateEvent {
  readonly type: 'navigate';
  readonly mode: 'orbit' | 'pan' | 'zoom' | 'fit' | 'reset' | 'preset';
  readonly snapshot: CameraSnapshot;
  readonly at: number;
}

export interface CameraProjectionEvent {
  readonly type: 'projection';
  readonly projection: ProjectionMode;
  readonly snapshot: CameraSnapshot;
  readonly at: number;
}

export interface CameraSyncEvent {
  readonly type: 'sync';
  readonly size: Size2D;
  readonly snapshot: CameraSnapshot;
  readonly at: number;
}

export interface CameraAnimationEvent {
  readonly type: 'animation';
  readonly phase: 'started' | 'updated' | 'completed' | 'cancelled';
  readonly snapshot: CameraSnapshot;
  readonly at: number;
}

export interface CameraConstraintEvent {
  readonly type: 'constraint';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface CameraErrorEvent {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface CameraWarningEvent {
  readonly type: 'warning';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export type CameraEvent =
  | CameraLifecycleEvent
  | CameraNavigateEvent
  | CameraProjectionEvent
  | CameraSyncEvent
  | CameraAnimationEvent
  | CameraConstraintEvent
  | CameraErrorEvent
  | CameraWarningEvent;

export type CameraEventListener = (event: CameraEvent) => void;

/**
 * Session event bus for camera updates.
 * Threading: listeners run on emitting thread; keep non-blocking.
 */
export class CameraEvents {
  private readonly listeners = new Set<CameraEventListener>();

  public subscribe(listener: CameraEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: CameraEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export type { PresetView };
