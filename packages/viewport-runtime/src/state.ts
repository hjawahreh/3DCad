import type { ViewportBackendKind, RenderMode, Size2D } from './types.js';
import type { ViewportLifecyclePhase } from './lifecycle.js';

export type ViewportRuntimePhase = ViewportLifecyclePhase;

export interface ViewportPresentationState {
  readonly visible: boolean;
  readonly fullscreen: boolean;
  readonly contextLost: boolean;
  readonly devicePixelRatio: number;
  readonly size: Size2D;
}

export interface ViewportFrameState {
  readonly frameNumber: number;
  readonly lastFrameMs: number;
  readonly pendingInvalidations: number;
  readonly renderMode: RenderMode;
}

export interface ViewportBackendState {
  readonly selected: ViewportBackendKind | undefined;
  readonly available: readonly ViewportBackendKind[];
  readonly deviceName: string;
  readonly vendor: string;
}

/**
 * Immutable snapshot of runtime state.
 * Ownership: value object; safe to share after publication.
 */
export interface ViewportState {
  readonly phase: ViewportRuntimePhase;
  readonly presentation: ViewportPresentationState;
  readonly frame: ViewportFrameState;
  readonly backend: ViewportBackendState;
  readonly sceneRevision: number | undefined;
  readonly documentRevision: number | undefined;
}

export const emptyViewportState = (
  phase: ViewportRuntimePhase = 'created'
): ViewportState =>
  Object.freeze({
    phase,
    presentation: Object.freeze({
      visible: true,
      fullscreen: false,
      contextLost: false,
      devicePixelRatio: 1,
      size: Object.freeze({ width: 1, height: 1 })
    }),
    frame: Object.freeze({
      frameNumber: 0,
      lastFrameMs: 0,
      pendingInvalidations: 0,
      renderMode: 'on-demand' as const
    }),
    backend: Object.freeze({
      selected: undefined,
      available: [],
      deviceName: 'unknown',
      vendor: 'unknown'
    }),
    sceneRevision: undefined,
    documentRevision: undefined
  });
