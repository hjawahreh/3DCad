/**
 * CLN-001A — ClinicalAccuracyEngine orchestrates stage evaluators into a report.
 */

import type { ClinicalAccuracyCaseEntry } from './dataset/DatasetManifest.js';
import type {
  ClinicalAccuracyReport,
  ClinicalBlindedReviewRecord,
  ClinicalEndToEndScorecardRow,
  ClinicalStageAccuracyResult
} from './ClinicalAccuracyReport.js';
import type { ClinicalValidationStatus } from './ClinicalValidationStatus.js';
import {
  evaluateCloseBaseAccuracy,
  evaluateImportAccuracy,
  evaluateOrientationAccuracy,
  evaluatePreparationAccuracy,
  evaluateSegmentationAccuracy,
  evaluateTrimAccuracy
} from './evaluators/StageEvaluators.js';
import type { Vec3 } from './metrics/SurfaceDistanceMetrics.js';
import type { TeethSegToothInstance } from './metrics/TeethSeg22Metrics.js';

export interface ClinicalAccuracyEvaluationInput {
  readonly caseEntry: ClinicalAccuracyCaseEntry;
  readonly datasetId: string;
  readonly import?: {
    readonly sourceSamples?: readonly Vec3[];
    readonly importedSamples?: readonly Vec3[];
    readonly topologyChanged?: boolean;
    readonly unitScalePreserved?: boolean;
    readonly geometryFingerprint?: string;
  };
  readonly orientation?: {
    readonly predicted?: {
      readonly superior: readonly [number, number, number];
      readonly anterior: readonly [number, number, number];
      readonly lateral: readonly [number, number, number];
    };
    readonly reference?: {
      readonly superior: readonly [number, number, number];
      readonly anterior: readonly [number, number, number];
      readonly lateral: readonly [number, number, number];
    };
  };
  readonly prepare?: { readonly engineeringOk?: boolean };
  readonly trim?: {
    readonly predictedBoundary?: readonly Vec3[];
    readonly referenceBoundary?: readonly Vec3[];
    readonly predictedRegionFaces?: ReadonlySet<number>;
    readonly referenceRegionFaces?: ReadonlySet<number>;
    readonly geometryFingerprint?: string;
  };
  readonly closeBase?: {
    readonly watertight?: boolean;
    readonly manifold?: boolean;
    readonly boundaryEdges?: number;
    readonly nonManifoldEdges?: number;
    readonly selfIntersection?: boolean;
    readonly geometryFingerprint?: string;
  };
  readonly segmentation?: {
    readonly predicted?: readonly TeethSegToothInstance[];
    readonly reference?: readonly TeethSegToothInstance[];
    readonly localizationRadiusMm?: number;
    readonly providerId?: string;
    readonly modelVersion?: string;
    readonly geometryFingerprint?: string;
  };
  readonly reviews?: readonly ClinicalBlindedReviewRecord[];
}

const overallStatus = (
  stages: readonly ClinicalStageAccuracyResult[]
): ClinicalValidationStatus => {
  if (stages.some((s) => s.verdict === 'FAIL')) return 'FAIL';
  const clinicalStages = stages.filter((s) => s.stage !== 'end-to-end');
  const anyAvailable = clinicalStages.some(
    (s) => s.verdict !== 'NOT_AVAILABLE' && s.verdict !== 'UNKNOWN'
  );
  if (!anyAvailable) return 'NOT_EVALUATED';
  const allClinicalGtMissing = clinicalStages.every(
    (s) =>
      s.verdict === 'NOT_AVAILABLE' ||
      s.verdict === 'ENGINEERING_VALIDATED' ||
      s.verdict === 'UNKNOWN'
  );
  if (allClinicalGtMissing) return 'ENGINE_VALIDATED';
  return 'NOT_EVALUATED';
};

const endToEndVerdict = (
  stages: readonly ClinicalStageAccuracyResult[]
): ClinicalStageAccuracyResult => {
  if (stages.some((s) => s.verdict === 'FAIL')) {
    return Object.freeze({
      stage: 'end-to-end',
      verdict: 'FAIL',
      metrics: Object.freeze({}),
      reason: 'One or more stages FAILED'
    });
  }
  if (stages.every((s) => s.verdict === 'NOT_AVAILABLE')) {
    return Object.freeze({
      stage: 'end-to-end',
      verdict: 'NOT_AVAILABLE',
      metrics: Object.freeze({}),
      reason: 'No clinical ground truth for end-to-end scoring'
    });
  }
  return Object.freeze({
    stage: 'end-to-end',
    verdict: 'UNKNOWN',
    metrics: Object.freeze({}),
    reason:
      'Partial engineering metrics only — NOT YET CLINICALLY VALIDATED'
  });
};

export class ClinicalAccuracyEngine {
  public evaluate(input: ClinicalAccuracyEvaluationInput): ClinicalAccuracyReport {
    const gt = input.caseEntry.groundTruth;
    const importResult = evaluateImportAccuracy(input.import ?? {});
    const orientationResult = evaluateOrientationAccuracy({
      groundTruth: gt,
      ...(input.orientation ?? {})
    });
    const prepareResult = evaluatePreparationAccuracy({
      groundTruth: gt,
      ...(input.prepare ?? {})
    });
    const trimResult = evaluateTrimAccuracy({
      groundTruth: gt,
      ...(input.trim ?? {})
    });
    const baseResult = evaluateCloseBaseAccuracy({
      groundTruth: gt,
      ...(input.closeBase ?? {})
    });
    const segEval = evaluateSegmentationAccuracy({
      groundTruth: gt,
      ...(input.segmentation ?? {})
    });
    const segResult: ClinicalStageAccuracyResult = Object.freeze({
      stage: segEval.stage,
      verdict: segEval.verdict,
      metrics: segEval.metrics,
      reason: segEval.reason,
      ...(segEval.geometryFingerprint !== undefined
        ? { geometryFingerprint: segEval.geometryFingerprint }
        : {})
    });
    const stageList = Object.freeze([
      importResult,
      orientationResult,
      prepareResult,
      trimResult,
      baseResult,
      segResult
    ]);
    const e2e = endToEndVerdict(stageList);
    const stages = Object.freeze([...stageList, e2e]);
    const status = overallStatus(stageList);

    return Object.freeze({
      version: 'cln-001a-report-v1',
      caseId: input.caseEntry.caseId,
      datasetId: input.datasetId,
      split: input.caseEntry.split,
      hardCaseTags: input.caseEntry.hardCaseTags,
      status,
      stages,
      segmentationBenchmark: segEval.benchmark,
      reviews: Object.freeze([...(input.reviews ?? [])]),
      fingerprints: Object.freeze({
        import: input.import?.geometryFingerprint ?? null,
        trim: input.trim?.geometryFingerprint ?? null,
        base: input.closeBase?.geometryFingerprint ?? null,
        segmentation: input.segmentation?.geometryFingerprint ?? null
      }),
      providerId: input.segmentation?.providerId ?? null,
      modelVersion: input.segmentation?.modelVersion ?? null,
      createdAt: new Date().toISOString(),
      limitations: Object.freeze([
        'Clinical accuracy requires licensed annotated ground truth — absent cases yield NOT_AVAILABLE',
        'reference-heuristic segmentation must not be reported as clinically accurate',
        'Thresholds with source UNKNOWN must not be labeled clinical',
        'CLINICAL_VALIDATED status requires governance evidence not present in this report'
      ])
    });
  }

  public toScorecardRow(report: ClinicalAccuracyReport): ClinicalEndToEndScorecardRow {
    const v = (stage: string) =>
      report.stages.find((s) => s.stage === stage)?.verdict ?? 'NOT_AVAILABLE';
    return Object.freeze({
      caseId: report.caseId,
      import: v('import'),
      orientation: v('orientation'),
      prepare: v('prepare'),
      trim: v('trim'),
      closeBase: v('close-base'),
      segmentation: v('segmentation'),
      endToEnd: v('end-to-end')
    });
  }
}

export const clinicalAccuracyEngine = new ClinicalAccuracyEngine();
