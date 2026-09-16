/**
 * CLN-001A — stage evaluators. Return NOT_AVAILABLE when ground truth is absent.
 */

import type { ClinicalAccuracyGroundTruthRefs } from '../dataset/DatasetManifest.js';
import type { ClinicalStageAccuracyResult } from '../ClinicalAccuracyReport.js';
import {
  hausdorffDistance,
  meanSymmetricSurfaceDistance,
  type Vec3
} from '../metrics/SurfaceDistanceMetrics.js';
import { orientationAxisErrors } from '../metrics/AngularErrorMetrics.js';
import { binaryOverlapFromSets } from '../metrics/RegionOverlapMetrics.js';
import {
  computeTeethSeg22Metrics,
  type TeethSegToothInstance
} from '../metrics/TeethSeg22Metrics.js';

const notAvailable = (
  stage: ClinicalStageAccuracyResult['stage'],
  reason: string
): ClinicalStageAccuracyResult =>
  Object.freeze({
    stage,
    verdict: 'NOT_AVAILABLE',
    metrics: Object.freeze({}),
    reason
  });

export const evaluateImportAccuracy = (input: {
  readonly sourceSamples?: readonly Vec3[];
  readonly importedSamples?: readonly Vec3[];
  readonly topologyChanged?: boolean;
  readonly unitScalePreserved?: boolean;
  readonly geometryFingerprint?: string;
}): ClinicalStageAccuracyResult => {
  if (input.sourceSamples === undefined || input.importedSamples === undefined) {
    return notAvailable(
      'import',
      'CLINICAL_REFERENCE_NOT_AVAILABLE — no paired source/imported sample clouds'
    );
  }
  const mean = meanSymmetricSurfaceDistance(input.sourceSamples, input.importedSamples);
  const hausdorff = hausdorffDistance(input.sourceSamples, input.importedSamples);
  return Object.freeze({
    stage: 'import',
    verdict: 'ENGINEERING_VALIDATED',
    metrics: Object.freeze({
      meanSurfaceDistanceMm: mean,
      hausdorffMm: hausdorff,
      topologyChanged: input.topologyChanged ?? null,
      unitScalePreserved: input.unitScalePreserved ?? null
    }),
    reason:
      'Quantitative surface distances computed; clinical pass/fail threshold UNKNOWN',
    ...(input.geometryFingerprint !== undefined
      ? { geometryFingerprint: input.geometryFingerprint }
      : {})
  });
};

export const evaluateOrientationAccuracy = (input: {
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
  readonly groundTruth: ClinicalAccuracyGroundTruthRefs;
}): ClinicalStageAccuracyResult => {
  if (!input.groundTruth.orientationPresent || input.predicted === undefined || input.reference === undefined) {
    return notAvailable(
      'orientation',
      'CLINICAL_REFERENCE_NOT_AVAILABLE — no reference clinical frame'
    );
  }
  const errors = orientationAxisErrors(input.predicted, input.reference);
  return Object.freeze({
    stage: 'orientation',
    verdict: 'ENGINEERING_VALIDATED',
    metrics: Object.freeze({ ...errors }),
    reason: 'Angular axis errors vs reference; clinical threshold UNKNOWN'
  });
};

export const evaluatePreparationAccuracy = (input: {
  readonly groundTruth: ClinicalAccuracyGroundTruthRefs;
  readonly engineeringOk?: boolean;
}): ClinicalStageAccuracyResult => {
  if (!input.groundTruth.preparedPresent) {
    return Object.freeze({
      stage: 'prepare',
      verdict:
        input.engineeringOk === true ? 'ENGINEERING_VALIDATED' : 'NOT_AVAILABLE',
      metrics: Object.freeze({}),
      reason:
        input.engineeringOk === true
          ? 'ENGINEERING_VALIDATED · CLINICAL_REFERENCE_NOT_AVAILABLE'
          : 'CLINICAL_REFERENCE_NOT_AVAILABLE'
    });
  }
  return notAvailable('prepare', 'Prepared reference present but comparator not wired');
};

export const evaluateTrimAccuracy = (input: {
  readonly groundTruth: ClinicalAccuracyGroundTruthRefs;
  readonly predictedBoundary?: readonly Vec3[];
  readonly referenceBoundary?: readonly Vec3[];
  readonly predictedRegionFaces?: ReadonlySet<number>;
  readonly referenceRegionFaces?: ReadonlySet<number>;
  readonly geometryFingerprint?: string;
}): ClinicalStageAccuracyResult => {
  if (
    !input.groundTruth.trimBoundaryPresent ||
    input.predictedBoundary === undefined ||
    input.referenceBoundary === undefined
  ) {
    return notAvailable(
      'trim',
      'CLINICAL_REFERENCE_NOT_AVAILABLE — no ReferenceSurfacePath ground truth'
    );
  }
  const mean = meanSymmetricSurfaceDistance(input.predictedBoundary, input.referenceBoundary);
  const hausdorff = hausdorffDistance(input.predictedBoundary, input.referenceBoundary);
  const region =
    input.predictedRegionFaces !== undefined && input.referenceRegionFaces !== undefined
      ? binaryOverlapFromSets(input.predictedRegionFaces, input.referenceRegionFaces)
      : null;
  return Object.freeze({
    stage: 'trim',
    verdict: 'ENGINEERING_VALIDATED',
    metrics: Object.freeze({
      meanBoundaryDistanceMm: mean,
      hausdorffBoundaryMm: hausdorff,
      regionPrecision: region?.precision ?? null,
      regionRecall: region?.recall ?? null,
      regionF1: region?.f1 ?? null
    }),
    reason: 'Boundary/region metrics vs reference; clinical threshold UNKNOWN',
    ...(input.geometryFingerprint !== undefined
      ? { geometryFingerprint: input.geometryFingerprint }
      : {})
  });
};

export const evaluateCloseBaseAccuracy = (input: {
  readonly groundTruth: ClinicalAccuracyGroundTruthRefs;
  readonly watertight?: boolean;
  readonly manifold?: boolean;
  readonly boundaryEdges?: number;
  readonly nonManifoldEdges?: number;
  readonly selfIntersection?: boolean;
  readonly geometryFingerprint?: string;
}): ClinicalStageAccuracyResult => {
  if (!input.groundTruth.basePresent) {
    const engOk =
      input.watertight === true &&
      input.manifold === true &&
      (input.boundaryEdges ?? 1) === 0 &&
      (input.nonManifoldEdges ?? 1) === 0 &&
      input.selfIntersection !== true;
    return Object.freeze({
      stage: 'close-base',
      verdict: engOk ? 'ENGINEERING_VALIDATED' : 'NOT_AVAILABLE',
      metrics: Object.freeze({
        watertight: input.watertight ?? null,
        manifold: input.manifold ?? null,
        boundaryEdges: input.boundaryEdges ?? null,
        nonManifoldEdges: input.nonManifoldEdges ?? null,
        selfIntersection: input.selfIntersection ?? null
      }),
      reason: engOk
        ? 'Manufacturing quality engineering checks only · no clinical base reference'
        : 'CLINICAL_REFERENCE_NOT_AVAILABLE',
      ...(input.geometryFingerprint !== undefined
        ? { geometryFingerprint: input.geometryFingerprint }
        : {})
    });
  }
  return notAvailable('close-base', 'Base reference present but comparator not wired');
};

export const evaluateSegmentationAccuracy = (input: {
  readonly groundTruth: ClinicalAccuracyGroundTruthRefs;
  readonly predicted?: readonly TeethSegToothInstance[];
  readonly reference?: readonly TeethSegToothInstance[];
  readonly localizationRadiusMm?: number;
  readonly providerId?: string;
  readonly geometryFingerprint?: string;
}): ClinicalStageAccuracyResult & {
  readonly benchmark: ReturnType<typeof computeTeethSeg22Metrics> | null;
} => {
  if (
    !input.groundTruth.segmentationPresent ||
    input.predicted === undefined ||
    input.reference === undefined
  ) {
    return Object.freeze({
      stage: 'segmentation',
      verdict: 'NOT_AVAILABLE',
      metrics: Object.freeze({
        providerId: input.providerId ?? null,
        note:
          input.providerId === 'reference-heuristic'
            ? 'reference-heuristic is not a clinical accuracy provider'
            : null
      }),
      reason:
        'CLINICAL_REFERENCE_NOT_AVAILABLE — no tooth-instance / FDI ground truth in dataset',
      benchmark: null,
      ...(input.geometryFingerprint !== undefined
        ? { geometryFingerprint: input.geometryFingerprint }
        : {})
    });
  }
  const benchmark = computeTeethSeg22Metrics({
    predicted: input.predicted,
    reference: input.reference,
    localizationRadiusMm: input.localizationRadiusMm ?? 5
  });
  return Object.freeze({
    stage: 'segmentation',
    verdict: 'ENGINEERING_VALIDATED',
    metrics: Object.freeze({
      tla: benchmark.tla,
      tir: benchmark.tir,
      tsa: benchmark.tsa,
      macroF1: benchmark.macroF1,
      microF1: benchmark.microF1
    }),
    reason: 'Benchmark metrics computed; clinical acceptance bar UNKNOWN',
    benchmark,
    ...(input.geometryFingerprint !== undefined
      ? { geometryFingerprint: input.geometryFingerprint }
      : {})
  });
};
