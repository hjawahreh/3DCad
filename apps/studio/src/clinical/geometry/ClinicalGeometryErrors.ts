/**
 * Structured clinical geometry error categories (CLN-008).
 * Recoverable where possible; no mesh algorithms here.
 */

export type ClinicalGeometryErrorCategory =
  | 'INPUT_INVALID'
  | 'BOUNDARY_INVALID'
  | 'TOPOLOGY_INVALID'
  | 'SPATIAL_INDEX_FAILED'
  | 'GEOMETRY_BACKEND_FAILED'
  | 'PREVIEW_FAILED'
  | 'VALIDATION_FAILED'
  | 'COMMIT_FAILED'
  | 'CANCELLED'
  | 'OUT_OF_MEMORY'
  | 'UNSUPPORTED_OPERATION'
  | 'GEOMETRY_WARMUP_FAILED';

export const CLINICAL_GEOMETRY_ERROR_CATEGORIES = Object.freeze([
  'INPUT_INVALID',
  'BOUNDARY_INVALID',
  'TOPOLOGY_INVALID',
  'SPATIAL_INDEX_FAILED',
  'GEOMETRY_BACKEND_FAILED',
  'PREVIEW_FAILED',
  'VALIDATION_FAILED',
  'COMMIT_FAILED',
  'CANCELLED',
  'OUT_OF_MEMORY',
  'UNSUPPORTED_OPERATION',
  'GEOMETRY_WARMUP_FAILED'
] as const satisfies readonly ClinicalGeometryErrorCategory[]);

export interface ClinicalGeometryError {
  readonly category: ClinicalGeometryErrorCategory;
  readonly message: string;
  readonly code?: string;
  readonly recoverable: boolean;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
  readonly cause?: unknown;
}

const DEFAULT_RECOVERABLE: Readonly<Record<ClinicalGeometryErrorCategory, boolean>> =
  Object.freeze({
    INPUT_INVALID: true,
    BOUNDARY_INVALID: true,
    TOPOLOGY_INVALID: true,
    SPATIAL_INDEX_FAILED: true,
    GEOMETRY_BACKEND_FAILED: true,
    PREVIEW_FAILED: true,
    VALIDATION_FAILED: true,
    COMMIT_FAILED: true,
    CANCELLED: true,
    OUT_OF_MEMORY: false,
    UNSUPPORTED_OPERATION: false,
    GEOMETRY_WARMUP_FAILED: true
  });

export const createClinicalGeometryError = (input: {
  readonly category: ClinicalGeometryErrorCategory;
  readonly message: string;
  readonly code?: string;
  readonly recoverable?: boolean;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
  readonly cause?: unknown;
}): ClinicalGeometryError =>
  Object.freeze({
    category: input.category,
    message: input.message,
    ...(input.code !== undefined ? { code: input.code } : {}),
    recoverable: input.recoverable ?? DEFAULT_RECOVERABLE[input.category],
    ...(input.details !== undefined ? { details: Object.freeze({ ...input.details }) } : {}),
    ...(input.cause !== undefined ? { cause: input.cause } : {})
  });

export type ClinicalGeometryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ClinicalGeometryError };

export const clinicalGeometrySuccess = <T>(value: T): ClinicalGeometryResult<T> =>
  Object.freeze({ ok: true, value });

export const clinicalGeometryFailure = (
  category: ClinicalGeometryErrorCategory,
  message: string,
  options?: {
    readonly code?: string;
    readonly recoverable?: boolean;
    readonly details?: Readonly<Record<string, string | number | boolean>>;
    readonly cause?: unknown;
  }
): ClinicalGeometryResult<never> =>
  Object.freeze({
    ok: false,
    error: createClinicalGeometryError({
      category,
      message,
      ...options
    })
  });
