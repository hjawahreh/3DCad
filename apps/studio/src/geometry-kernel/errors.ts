/**
 * Structured clinical geometry kernel error categories (CLN-008).
 */

export type GeometryKernelErrorCode =
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
  | 'UNSUPPORTED_OPERATION';

export class GeometryKernelError extends Error {
  public readonly code: GeometryKernelErrorCode;

  public constructor(code: GeometryKernelErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'GeometryKernelError';
    this.code = code;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export const isGeometryKernelError = (value: unknown): value is GeometryKernelError =>
  value instanceof GeometryKernelError;
