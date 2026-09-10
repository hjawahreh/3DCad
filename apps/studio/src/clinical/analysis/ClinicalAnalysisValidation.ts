/**
 * Analysis validation helpers.
 */

import type { AnalysisValidationState, ClinicalAnalysisResult } from './types.js';

export const summarizeValidation = (result: ClinicalAnalysisResult): string => {
  switch (result.validity) {
    case 'VALID':
      return 'Measurement completed.';
    case 'WARNING':
      return result.warnings[0] ?? 'Result requires review.';
    case 'INCOMPLETE':
      return result.warnings[0] ?? 'Insufficient data for this analysis.';
    case 'INVALID':
      return result.warnings[0] ?? 'Geometry is unsuitable for this analysis.';
  }
};

export const isActionable = (state: AnalysisValidationState): boolean =>
  state === 'VALID' || state === 'WARNING';
