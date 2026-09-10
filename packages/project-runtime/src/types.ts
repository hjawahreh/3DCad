import { failure, success, type Result } from '@cad-studio/platform-runtime';

export type ProjectErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'validation'
  | 'lifecycle'
  | 'dirty'
  | 'autosave'
  | 'readonly'
  | 'unexpected';

export interface ProjectError {
  readonly code: ProjectErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type ProjectResult<T> = Result<T, ProjectError>;

export const projectSuccess = <T>(value: T): ProjectResult<T> => success(value);

export const projectFailure = (
  code: ProjectErrorCode,
  message: string,
  cause?: unknown
): ProjectResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ProjectRuntimeId = Brand<string, 'ProjectRuntimeId'>;
export type ProjectSessionId = Brand<string, 'ProjectSessionId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type ProjectRevision = Brand<number, 'ProjectRevision'>;

export const asProjectRuntimeId = (value: string): ProjectRuntimeId => value as ProjectRuntimeId;
export const asProjectSessionId = (value: string): ProjectSessionId => value as ProjectSessionId;
export const asProjectId = (value: string): ProjectId => value as ProjectId;
export const asProjectRevision = (value: number): ProjectRevision => value as ProjectRevision;

/**
 * Opaque project location reference — host resolves to filesystem/URI.
 * Project Runtime does not parse or serialize project files.
 */
export type ProjectLocationRef = Brand<string, 'ProjectLocationRef'>;

export const asProjectLocationRef = (value: string): ProjectLocationRef =>
  value as ProjectLocationRef;

export interface ProjectClock {
  readonly now: () => number;
}

export const createDefaultProjectClock = (): ProjectClock => ({
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
});

/**
 * Injectable timer for autosave scheduling (deterministic in tests).
 */
export interface ProjectScheduler {
  readonly schedule: (callback: () => void, delayMs: number) => number;
  readonly cancel: (handle: number) => void;
}

export const createDefaultProjectScheduler = (): ProjectScheduler => ({
  schedule: (callback, delayMs) =>
    setTimeout(callback, delayMs) as unknown as number,
  cancel: (handle) => {
    clearTimeout(handle);
  }
});
