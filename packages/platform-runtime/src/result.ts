export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const success = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const failure = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type RuntimeErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'forbidden'
  | 'invalid'
  | 'not-found'
  | 'timeout'
  | 'unavailable'
  | 'unexpected';

export interface RuntimeError {
  readonly code: RuntimeErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export const runtimeError = (
  code: RuntimeErrorCode,
  message: string,
  cause?: unknown
): RuntimeError => ({ code, message, cause });
