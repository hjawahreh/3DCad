/**
 * CLN-001A — blinded human review records (no algorithm/score leakage in payload).
 */

export type ClinicalBlindedReviewRating =
  | 'ACCEPT'
  | 'MINOR_CORRECTION'
  | 'MAJOR_CORRECTION'
  | 'FAIL';

export interface ClinicalBlindedReviewSubmission {
  readonly reviewId: string;
  readonly caseId: string;
  readonly stage: 'orientation' | 'trim' | 'close-base' | 'segmentation';
  readonly rating: ClinicalBlindedReviewRating;
  readonly notes: string;
  /** Always true for this protocol. */
  readonly blinded: true;
  readonly createdAt: string;
}

export const createBlindedReview = (input: {
  readonly reviewId: string;
  readonly caseId: string;
  readonly stage: ClinicalBlindedReviewSubmission['stage'];
  readonly rating: ClinicalBlindedReviewRating;
  readonly notes: string;
}): ClinicalBlindedReviewSubmission =>
  Object.freeze({
    reviewId: input.reviewId,
    caseId: input.caseId,
    stage: input.stage,
    rating: input.rating,
    notes: input.notes,
    blinded: true,
    createdAt: new Date().toISOString()
  });

/** Pairwise agreement rate across reviewers for the same case+stage (null if <2). */
export const blindedReviewAgreement = (
  reviews: readonly ClinicalBlindedReviewSubmission[]
): { readonly comparablePairs: number; readonly agreementRate: number | null } => {
  const byKey = new Map<string, ClinicalBlindedReviewRating[]>();
  for (const r of reviews) {
    const key = `${r.caseId}::${r.stage}`;
    const list = byKey.get(key) ?? [];
    list.push(r.rating);
    byKey.set(key, list);
  }
  let pairs = 0;
  let agree = 0;
  for (const ratings of byKey.values()) {
    for (let i = 0; i < ratings.length; i += 1) {
      for (let j = i + 1; j < ratings.length; j += 1) {
        pairs += 1;
        if (ratings[i] === ratings[j]) agree += 1;
      }
    }
  }
  return Object.freeze({
    comparablePairs: pairs,
    agreementRate: pairs === 0 ? null : agree / pairs
  });
};
