import { failure, success, type Result } from '@cad-studio/platform-runtime';
import type { BackendKind } from '@cad-studio/viewport';

export type ViewportErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'validation'
  | 'lifecycle'
  | 'backend'
  | 'context-lost'
  | 'unexpected';

export interface ViewportError {
  readonly code: ViewportErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type ViewportResult<T> = Result<T, ViewportError>;

export const viewportSuccess = <T>(value: T): ViewportResult<T> => success(value);

export const viewportFailure = (
  code: ViewportErrorCode,
  message: string,
  cause?: unknown
): ViewportResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ViewportId = Brand<string, 'ViewportId'>;
export type ViewportSessionId = Brand<string, 'ViewportSessionId'>;
export type FrameNumber = Brand<number, 'FrameNumber'>;

export const asViewportId = (value: string): ViewportId => value as ViewportId;
export const asViewportSessionId = (value: string): ViewportSessionId =>
  value as ViewportSessionId;
export const asFrameNumber = (value: number): FrameNumber => value as FrameNumber;

export type ViewportBackendKind = BackendKind;

export type RenderMode = 'continuous' | 'on-demand' | 'idle';

export interface Size2D {
  readonly width: number;
  readonly height: number;
}

export interface DevicePixelInfo {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly bufferWidth: number;
  readonly bufferHeight: number;
}

/**
 * Host clock / frame pump injectable for deterministic tests.
 * Ownership: caller may share a clock across sessions; do not mutate after attach.
 * Threading: invoke callbacks on the viewport owning thread only.
 */
export interface FrameClock {
  readonly now: () => number;
  readonly requestFrame: (callback: (timeMs: number) => void) => number;
  readonly cancelFrame: (handle: number) => void;
}

export const createDefaultFrameClock = (): FrameClock => {
  const hasRaf = typeof requestAnimationFrame === 'function';
  const hasCancel = typeof cancelAnimationFrame === 'function';
  return {
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    requestFrame: (callback) => {
      if (hasRaf) {
        return requestAnimationFrame(callback);
      }
      return setTimeout(() => callback(Date.now()), 16) as unknown as number;
    },
    cancelFrame: (handle) => {
      if (hasCancel) {
        cancelAnimationFrame(handle);
        return;
      }
      clearTimeout(handle);
    }
  };
};

/**
 * Minimal canvas surface contract (DOM or test double).
 * Ownership: host application owns the element; runtime never creates DOM nodes.
 */
export interface ViewportCanvasElement {
  width: number;
  height: number;
  clientWidth?: number;
  clientHeight?: number;
  getContext?: (contextId: string, options?: unknown) => unknown;
  addEventListener?: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => void;
  removeEventListener?: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ) => void;
}
