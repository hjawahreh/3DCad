import { failure, success, type Result } from '@cad-studio/platform-runtime';
import type { ViewportId, ViewportSessionId } from '@cad-studio/viewport-runtime';

export type InteractionErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'validation'
  | 'lifecycle'
  | 'capture'
  | 'unexpected';

export interface InteractionError {
  readonly code: InteractionErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type InteractionResult<T> = Result<T, InteractionError>;

export const interactionSuccess = <T>(value: T): InteractionResult<T> => success(value);

export const interactionFailure = (
  code: InteractionErrorCode,
  message: string,
  cause?: unknown
): InteractionResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type InteractionRuntimeId = Brand<string, 'InteractionRuntimeId'>;
export type InteractionSessionId = Brand<string, 'InteractionSessionId'>;
export type PointerId = Brand<number, 'PointerId'>;
export type InteractionTargetId = Brand<string, 'InteractionTargetId'>;
export type CursorId = Brand<string, 'CursorId'>;
export type ConsumerId = Brand<string, 'ConsumerId'>;

export const asInteractionRuntimeId = (value: string): InteractionRuntimeId =>
  value as InteractionRuntimeId;
export const asInteractionSessionId = (value: string): InteractionSessionId =>
  value as InteractionSessionId;
export const asPointerId = (value: number): PointerId => value as PointerId;
export const asInteractionTargetId = (value: string): InteractionTargetId =>
  value as InteractionTargetId;
export const asCursorId = (value: string): CursorId => value as CursorId;
export const asConsumerId = (value: string): ConsumerId => value as ConsumerId;

export type { ViewportId, ViewportSessionId };

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export type PointerType = 'mouse' | 'pen' | 'touch' | 'unknown';

export type MouseButton = 'none' | 'primary' | 'secondary' | 'auxiliary' | 'back' | 'forward';

export interface ModifierKeys {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

export const EMPTY_MODIFIERS: ModifierKeys = Object.freeze({
  alt: false,
  ctrl: false,
  meta: false,
  shift: false
});

/**
 * Host clock for latency metrics and deterministic tests.
 * Ownership: caller-provided; do not mutate after attach.
 * Threading: invoke on the interaction owning thread only.
 */
export interface InteractionClock {
  readonly now: () => number;
}

export const createDefaultInteractionClock = (): InteractionClock => ({
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
});
