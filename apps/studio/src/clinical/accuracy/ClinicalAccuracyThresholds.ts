/**
 * CLN-001A — thresholds with explicit sources.
 * Do not invent "clinical" numbers. UNKNOWN when no literature/consensus exists.
 */

export type ClinicalThresholdSource =
  | 'UNKNOWN'
  | 'literature'
  | 'benchmark'
  | 'expert-consensus'
  | 'project-engineering';

export interface ClinicalAccuracyThreshold {
  readonly id: string;
  readonly description: string;
  readonly value: number | null;
  readonly unit: string;
  readonly source: ClinicalThresholdSource;
  readonly sourceDetail: string;
}

export interface ClinicalAccuracyThresholds {
  readonly version: string;
  readonly importMaxMeanSurfaceDistanceMm: ClinicalAccuracyThreshold;
  readonly orientationMaxSuperiorAxisErrorDeg: ClinicalAccuracyThreshold;
  readonly trimMaxMeanBoundaryDistanceMm: ClinicalAccuracyThreshold;
  readonly baseRequireWatertight: ClinicalAccuracyThreshold;
  readonly segmentationMinTsa: ClinicalAccuracyThreshold;
  readonly segmentationMinTir: ClinicalAccuracyThreshold;
}

const thr = (
  id: string,
  description: string,
  value: number | null,
  unit: string,
  source: ClinicalThresholdSource,
  sourceDetail: string
): ClinicalAccuracyThreshold =>
  Object.freeze({ id, description, value, unit, source, sourceDetail });

/**
 * Default thresholds: engineering requirements only where project-defined;
 * clinical numbers remain UNKNOWN until governance supplies them.
 */
export const DEFAULT_CLINICAL_ACCURACY_THRESHOLDS: ClinicalAccuracyThresholds =
  Object.freeze({
    version: 'cln-001a-thresholds-v1',
    importMaxMeanSurfaceDistanceMm: thr(
      'import.maxMeanSurfaceMm',
      'Max mean surface distance after import/normalize',
      null,
      'mm',
      'UNKNOWN',
      'No clinical import tolerance ratified for CLN-001A'
    ),
    orientationMaxSuperiorAxisErrorDeg: thr(
      'orient.maxSuperiorAxisDeg',
      'Max superior-axis angular error vs reference clinical frame',
      null,
      'deg',
      'UNKNOWN',
      'No expert-consensus orientation angular tolerance yet'
    ),
    trimMaxMeanBoundaryDistanceMm: thr(
      'trim.maxMeanBoundaryMm',
      'Max mean distance between predicted and reference trim boundary',
      null,
      'mm',
      'UNKNOWN',
      'No clinical trim boundary tolerance ratified'
    ),
    baseRequireWatertight: thr(
      'base.watertight',
      'Manufacturing-oriented watertight requirement (engineering)',
      1,
      'boolean',
      'project-engineering',
      'GEO-001D / manufacturing quality contract: boundaryEdges=0'
    ),
    segmentationMinTsa: thr(
      'seg.minTsa',
      'Minimum TSA (mean tooth-instance F1) on held-out benchmark',
      null,
      'ratio',
      'UNKNOWN',
      '3DTeethSeg22-compatible metric exists; acceptance bar not set without licensed eval'
    ),
    segmentationMinTir: thr(
      'seg.minTir',
      'Minimum TIR on held-out benchmark',
      null,
      'ratio',
      'UNKNOWN',
      'Benchmark definition known; clinical bar UNKNOWN'
    )
  });
