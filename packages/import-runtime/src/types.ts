import { failure, success, type Result } from '@cad-studio/platform-runtime';
import type { ProjectId, ProjectSessionId } from '@cad-studio/project-runtime';

export type ImportErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'validation'
  | 'lifecycle'
  | 'unsupported'
  | 'pipeline'
  | 'unexpected';

export interface ImportError {
  readonly code: ImportErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type ImportResultType<T> = Result<T, ImportError>;

export const importSuccess = <T>(value: T): ImportResultType<T> => success(value);

export const importFailure = (
  code: ImportErrorCode,
  message: string,
  cause?: unknown
): ImportResultType<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ImportRuntimeId = Brand<string, 'ImportRuntimeId'>;
export type ImportSessionId = Brand<string, 'ImportSessionId'>;
export type ImportRequestId = Brand<string, 'ImportRequestId'>;
export type ImporterPluginId = Brand<string, 'ImporterPluginId'>;
export type ImportRevision = Brand<number, 'ImportRevision'>;

export const asImportRuntimeId = (value: string): ImportRuntimeId => value as ImportRuntimeId;
export const asImportSessionId = (value: string): ImportSessionId => value as ImportSessionId;
export const asImportRequestId = (value: string): ImportRequestId => value as ImportRequestId;
export const asImporterPluginId = (value: string): ImporterPluginId => value as ImporterPluginId;
export const asImportRevision = (value: number): ImportRevision => value as ImportRevision;

export type { ProjectId, ProjectSessionId };

/**
 * Opaque source file reference — host resolves filesystem/URI.
 * Import Runtime does not read bytes or parse formats.
 */
export type ImportSourceRef = Brand<string, 'ImportSourceRef'>;

export const asImportSourceRef = (value: string): ImportSourceRef => value as ImportSourceRef;

export type ReservedImportFormat =
  | 'stl'
  | 'obj'
  | 'ply'
  | 'off'
  | '3mf'
  | 'gltf'
  | 'glb'
  | 'step'
  | 'iges';

export interface ImportClock {
  readonly now: () => number;
}

export const createDefaultImportClock = (): ImportClock => ({
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
});
