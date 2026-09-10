/**
 * Structured segmentation error categories (CLN-009).
 */

export type SegmentationErrorCode =
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_LOAD_FAILED'
  | 'INVALID_INPUT'
  | 'PREPROCESSING_FAILED'
  | 'INFERENCE_FAILED'
  | 'POSTPROCESSING_FAILED'
  | 'IDENTIFICATION_FAILED'
  | 'VALIDATION_FAILED'
  | 'CANCELLED'
  | 'OUT_OF_MEMORY'
  | 'UNSUPPORTED_MODEL'
  | 'PROVIDER_NOT_FOUND'
  | 'REVIEW_INVALID';

export class SegmentationError extends Error {
  public readonly code: SegmentationErrorCode;

  public constructor(code: SegmentationErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'SegmentationError';
    this.code = code;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export const isSegmentationError = (value: unknown): value is SegmentationError =>
  value instanceof SegmentationError;
