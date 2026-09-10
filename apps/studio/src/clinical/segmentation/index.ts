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
export type { SegmentationProvider } from './provider/SegmentationProvider.js';

export { ClinicalSegmentationRuntime } from './ClinicalSegmentationRuntime.js';
export { ClinicalSegmentationController } from './ClinicalSegmentationController.js';
export { createClinicalSegmentationOperationHandler } from './ClinicalSegmentationHandler.js';
export { CLINICAL_SEGMENTATION_COMMANDS } from './ClinicalSegmentationCommands.js';
export { ClinicalSegmentationOverlay } from './ClinicalSegmentationOverlay.js';
export { ClinicalSegmentationToolbar } from './ClinicalSegmentationToolbar.js';
export { runSegmentationBenchmarkSmoke } from './benchmark/SegmentationBenchmark.js';
export { describeConfidence, ConfidenceCalibrationTracker } from './confidence/ConfidenceSystem.js';
