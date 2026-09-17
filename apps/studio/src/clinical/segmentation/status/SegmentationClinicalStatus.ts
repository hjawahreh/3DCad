/**
 * CLN-SEG-001 — honest clinical / engineering status for segmentation results.
 * Never claim Clinically Validated without completed clinical evaluation.
 */

export type SegmentationClinicalStatus =
  | 'Reference Segmentation'
  | 'Production Model — Not Validated'
  | 'Benchmark Validated'
  | 'Clinical Review Required'
  | 'Clinically Validated';

export const resolveSegmentationClinicalStatus = (input: {
  readonly providerId: string | undefined;
  readonly benchmarkValidated?: boolean;
  readonly clinicalValidated?: boolean;
  readonly needsClinicalReview?: boolean;
}): SegmentationClinicalStatus => {
  if (input.clinicalValidated === true) {
    return 'Clinically Validated';
  }
  if (input.benchmarkValidated === true) {
    return 'Benchmark Validated';
  }
  const id = (input.providerId ?? '').toLowerCase();
  const isReference =
    id.includes('heuristic') ||
    id.includes('reference') ||
    id === 'reference-heuristic';
  if (isReference) {
    return 'Reference Segmentation';
  }
  if (input.needsClinicalReview === true || id.includes('production')) {
    if (id.includes('production')) {
      return input.needsClinicalReview
        ? 'Clinical Review Required'
        : 'Production Model — Not Validated';
    }
    return 'Clinical Review Required';
  }
  return 'Production Model — Not Validated';
};
