import type { Result, RuntimeError } from './result.js';

export type CorrelationId = string & { readonly __brand: 'CorrelationId' };
export type Revision = number & { readonly __brand: 'Revision' };

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface ExecutionContext {
  readonly correlationId: CorrelationId;
  readonly signal: AbortSignal;
  readonly clock: Clock;
}

export type AsyncResult<T> = Promise<Result<T, RuntimeError>>;

export interface Progress {
  readonly completed: number;
  readonly total?: number;
  readonly message?: string;
}

export type ProgressReporter = (progress: Progress) => void;

export const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);
