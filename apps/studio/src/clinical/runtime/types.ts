/**
 * Clinical branded ids and result helpers.
 * Ownership: clinical module only; no platform type changes.
 */

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ClinicalCaseId = Brand<string, 'ClinicalCaseId'>;
export type ClinicalSessionId = Brand<string, 'ClinicalSessionId'>;
export type ClinicalRevision = Brand<number, 'ClinicalRevision'>;
export type ClinicalToolId = Brand<string, 'ClinicalToolId'>;

export const asClinicalCaseId = (value: string): ClinicalCaseId => value as ClinicalCaseId;
export const asClinicalSessionId = (value: string): ClinicalSessionId =>
  value as ClinicalSessionId;
export const asClinicalRevision = (value: number): ClinicalRevision =>
  value as ClinicalRevision;
export const asClinicalToolId = (value: string): ClinicalToolId => value as ClinicalToolId;

export type ClinicalErrorCode =
  | 'lifecycle'
  | 'validation'
  | 'dirty'
  | 'unavailable'
  | 'conflict'
  | 'cancelled'
  | 'not-found';

export interface ClinicalError {
  readonly code: ClinicalErrorCode;
  readonly message: string;
}

export type ClinicalResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ClinicalError };

export const clinicalSuccess = <T>(value: T): ClinicalResult<T> =>
  Object.freeze({ ok: true, value });

export const clinicalFailure = (
  code: ClinicalErrorCode,
  message: string
): ClinicalResult<never> => Object.freeze({ ok: false, error: Object.freeze({ code, message }) });

export type ClinicalClock = { readonly now: () => number };

export const createDefaultClinicalClock = (): ClinicalClock => ({
  now: () => Date.now()
});
