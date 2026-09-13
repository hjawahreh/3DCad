export { ALL_FDI_NUMBERS, FDI_PERMANENT_TEETH, getFdiDefinition, isFdiNumber } from './fdi/FdiNumbering.js';
export type { FdiNumber, FdiToothDefinition } from './fdi/FdiNumbering.js';

export type {
  SegmentationPrediction,
  SemanticLabel,
  ToothInstancePrediction,
  IdentificationStatus,
  ConfidenceBand
} from './prediction/types.js';

export { createDefaultSegmentationRegistry, SegmentationProviderRegistry } from './provider/SegmentationProviderRegistry.js';
export { ReferenceHeuristicProvider } from './provider/ReferenceHeuristicProvider.js';
export { OnnxSegmentationProvider } from './provider/adapters/OnnxSegmentationProvider.js';
export type { SegmentationProvider } from './provider/SegmentationProvider.js';
export {
  detectInferenceRuntime,
  type InferenceRuntimeSnapshot
} from './provider/adapters/InferenceCapabilityDetector.js';

export { ClinicalSegmentationRuntime } from './ClinicalSegmentationRuntime.js';
export { ClinicalSegmentationController } from './ClinicalSegmentationController.js';
export { createClinicalSegmentationOperationHandler } from './ClinicalSegmentationHandler.js';
export { CLINICAL_SEGMENTATION_COMMANDS } from './ClinicalSegmentationCommands.js';
export { ClinicalSegmentationOverlay } from './ClinicalSegmentationOverlay.js';
export { ClinicalSegmentationToolbar } from './ClinicalSegmentationToolbar.js';
export { ClinicalSegmentationInspector } from './ClinicalSegmentationInspector.js';
export {
  runSegmentationBenchmarkSmoke,
  buildSegmentationModelComparison
} from './benchmark/SegmentationBenchmark.js';
export { planLargeMeshSampling } from './preprocess/LargeMeshSampling.js';
export { describeConfidence, ConfidenceCalibrationTracker } from './confidence/ConfidenceSystem.js';
export {
  buildSegmentationFaceColors,
  SEGMENTATION_SEMANTIC_COLORS
} from './display/ClinicalSegmentationColors.js';
export {
  summarizeReview,
  toUserFacingProgressMessage
} from './display/ClinicalSegmentationPresentation.js';
export {
  validateSegmentationPrediction,
  isSegmentationAcceptBlocked,
  SEGMENTATION_VALIDATION_VERSION,
  type ClinicalSegmentationValidationReport,
  type SegmentationValidationVerdict,
  type SegmentationValidationCheck
} from './ClinicalSegmentationValidation.js';
export {
  buildFaceMembershipFromPrediction,
  evaluateSegmentationIntegrity,
  evaluateCaseMovementReadiness,
  markSegmentationStaleOnGeometryCommit,
  faceMembershipHasIntegrity,
  isNonClinicalSegmentationProvider,
  segmentationIntegrityUiLabel,
  movementReadinessUiLabel,
  type SegmentationIntegrityStatus,
  type SegmentationFaceMembership,
  type SegmentationIntegritySnapshot
} from './ClinicalSegmentationIntegrity.js';
export {
  computeToothLocalFrame,
  computeToothLocalFrames,
  type ClinicalToothLocalFrame
} from './ClinicalToothLocalFrame.js';
export {
  SEGMENTATION_MANUAL_EDIT_CAPABILITIES,
  mergeInstances,
  splitInstance,
  relabelInstanceFdi,
  markInstanceMissing,
  markSemanticFaces,
  type ReviewActionMeta,
  type ReviewActionType
} from './review/ClinicalSegmentationReview.js';

