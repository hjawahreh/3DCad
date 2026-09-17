/**
 * CLN-001A — clinical accuracy public barrel.
 */

export {
  CLINICAL_VALIDATION_STATUSES,
  type ClinicalValidationStatus,
  type ClinicalStageAccuracyVerdict
} from './ClinicalValidationStatus.js';

export {
  DEFAULT_CLINICAL_ACCURACY_THRESHOLDS,
  type ClinicalAccuracyThreshold,
  type ClinicalAccuracyThresholds,
  type ClinicalThresholdSource
} from './ClinicalAccuracyThresholds.js';

export type {
  ClinicalAccuracyReport,
  ClinicalAccuracyStageId,
  ClinicalBlindedReviewRecord,
  ClinicalEndToEndScorecardRow,
  ClinicalStageAccuracyResult
} from './ClinicalAccuracyReport.js';

export {
  ClinicalAccuracyEngine,
  clinicalAccuracyEngine,
  type ClinicalAccuracyEvaluationInput
} from './ClinicalAccuracyEngine.js';

export {
  parseDatasetManifest,
  validateDatasetManifest,
  type ClinicalAccuracyCaseEntry,
  type ClinicalAccuracyDatasetManifest,
  type ClinicalAccuracySplit,
  type ClinicalHardCaseTag
} from './dataset/DatasetManifest.js';

export {
  computeTeethSeg22Metrics,
  type PerToothSegResult,
  type TeethSeg22MetricsResult,
  type TeethSegToothInstance
} from './metrics/TeethSeg22Metrics.js';

export {
  directedSurfaceDistanceStats,
  hausdorffDistance,
  meanSymmetricSurfaceDistance
} from './metrics/SurfaceDistanceMetrics.js';

export { orientationAxisErrors, axisAngularErrorDegrees } from './metrics/AngularErrorMetrics.js';

export { binaryOverlapFromSets } from './metrics/RegionOverlapMetrics.js';

export {
  createProductionModelProvider,
  ProductionModelProviderInfo,
  type ClinicalSegmentationProvider
} from './providers/ProductionModelProvider.js';

export {
  createBlindedReview,
  blindedReviewAgreement,
  type ClinicalBlindedReviewRating,
  type ClinicalBlindedReviewSubmission
} from './review/BlindedReview.js';

export {
  buildErrorPropagationChain,
  type ClinicalErrorPropagationLink
} from './ErrorPropagation.js';

export {
  isReferenceSurfacePath,
  type ReferenceSurfacePath,
  type ReferenceSurfacePathPoint
} from './ReferenceSurfacePath.js';

export {
  createClinicalFailureReport,
  type ClinicalFailureReport
} from './ClinicalFailureReport.js';

export {
  PRODUCTION_MODEL_GOVERNANCE,
  type ClinicalModelGovernanceRecord
} from './ModelGovernance.js';

export {
  TEETH_SEG22_GINGIVA_LABEL,
  adaptTeethSeg22PointLabels,
  evaluateTeethSeg22Benchmark,
  serializeTeethSeg22Benchmark,
  formatTeethSeg22MetricsReport,
  type TeethSeg22AdaptedInstances,
  type TeethSeg22PointCloudLabeling,
  type TeethSeg22BenchmarkSerialization
} from './benchmark/TeethSeg22Adapter.js';

export {
  evaluateImportAccuracy,
  evaluateOrientationAccuracy,
  evaluatePreparationAccuracy,
  evaluateTrimAccuracy,
  evaluateCloseBaseAccuracy,
  evaluateSegmentationAccuracy
} from './evaluators/StageEvaluators.js';
