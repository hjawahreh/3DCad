/**
 * CLN-001A — clinical validation status vocabulary.
 * Never promote UNKNOWN / NOT_AVAILABLE to PASS.
 */

export type ClinicalValidationStatus =
  | 'NOT_EVALUATED'
  | 'ENGINE_VALIDATED'
  | 'BENCHMARK_VALIDATED'
  | 'CLINICAL_REVIEWED'
  | 'CLINICAL_VALIDATED'
  | 'NOT_AVAILABLE'
  | 'FAIL';

export type ClinicalStageAccuracyVerdict =
  | 'PASS'
  | 'FAIL'
  | 'UNKNOWN'
  | 'NOT_AVAILABLE'
  | 'ENGINEERING_VALIDATED';

export const CLINICAL_VALIDATION_STATUSES = Object.freeze([
  'NOT_EVALUATED',
  'ENGINE_VALIDATED',
  'BENCHMARK_VALIDATED',
  'CLINICAL_REVIEWED',
  'CLINICAL_VALIDATED',
  'NOT_AVAILABLE',
  'FAIL'
] as const satisfies readonly ClinicalValidationStatus[]);
