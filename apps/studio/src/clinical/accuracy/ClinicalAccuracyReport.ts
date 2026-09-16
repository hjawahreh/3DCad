/**
 * CLN-001A — clinical accuracy report types.
 */

import type {
  ClinicalStageAccuracyVerdict,
  ClinicalValidationStatus
} from './ClinicalValidationStatus.js';
import type { ClinicalHardCaseTag } from './dataset/DatasetManifest.js';
import type { TeethSeg22MetricsResult } from './metrics/TeethSeg22Metrics.js';

export type ClinicalAccuracyStageId =
  | 'import'
  | 'orientation'
  | 'prepare'
  | 'trim'
  | 'close-base'
  | 'segmentation'
  | 'end-to-end';

export interface ClinicalStageAccuracyResult {
  readonly stage: ClinicalAccuracyStageId;
  readonly verdict: ClinicalStageAccuracyVerdict;
  readonly metrics: Readonly<Record<string, number | string | boolean | null>>;
  readonly reason: string;
  readonly geometryFingerprint?: string;
}

export interface ClinicalBlindedReviewRecord {
  readonly reviewId: string;
  readonly stage: ClinicalAccuracyStageId;
  readonly rating: 'ACCEPT' | 'MINOR_CORRECTION' | 'MAJOR_CORRECTION' | 'FAIL';
  readonly notes: string;
  readonly blinded: true;
}

export interface ClinicalAccuracyReport {
  readonly version: 'cln-001a-report-v1';
  readonly caseId: string;
  readonly datasetId: string | null;
  readonly split: string | null;
  readonly hardCaseTags: readonly ClinicalHardCaseTag[];
  readonly status: ClinicalValidationStatus;
  readonly stages: readonly ClinicalStageAccuracyResult[];
  readonly segmentationBenchmark: TeethSeg22MetricsResult | null;
  readonly reviews: readonly ClinicalBlindedReviewRecord[];
  readonly fingerprints: Readonly<Record<string, string | null>>;
  readonly providerId: string | null;
  readonly modelVersion: string | null;
  readonly createdAt: string;
  readonly limitations: readonly string[];
}

export interface ClinicalEndToEndScorecardRow {
  readonly caseId: string;
  readonly import: ClinicalStageAccuracyVerdict;
  readonly orientation: ClinicalStageAccuracyVerdict;
  readonly prepare: ClinicalStageAccuracyVerdict;
  readonly trim: ClinicalStageAccuracyVerdict;
  readonly closeBase: ClinicalStageAccuracyVerdict;
  readonly segmentation: ClinicalStageAccuracyVerdict;
  readonly endToEnd: ClinicalStageAccuracyVerdict;
}
