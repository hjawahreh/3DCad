/**
 * Clinical analysis result & measurement contracts (CLN-010).
 * Observational — no mesh buffers stored.
 */

import type { AnalysisUnit } from './units.js';

export type AnalysisValidationState = 'VALID' | 'WARNING' | 'INCOMPLETE' | 'INVALID';

export type AnalysisTypeId =
  | 'distance'
  | 'angle'
  | 'tooth-dimensions'
  | 'tooth-position'
  | 'tooth-orientation'
  | 'arch'
  | 'spacing'
  | 'crowding'
  | 'arch-width'
  | 'bolton'
  | 'occlusion'
  | 'collision';

export type DistanceKind = 'euclidean' | 'surface-path';

export interface AnalysisVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AnalysisFrame {
  readonly origin: AnalysisVec3;
  /** Local X — mesiodistal (estimated). */
  readonly x: AnalysisVec3;
  /** Local Y — buccolingual (estimated). */
  readonly y: AnalysisVec3;
  /** Local Z — apicocoronal (estimated). */
  readonly z: AnalysisVec3;
  readonly method: string;
  readonly version: string;
}

export interface AnalysisMeasurementValue {
  readonly value: number;
  readonly unit: AnalysisUnit;
  readonly display: string;
  readonly uncertainty?: number | undefined;
}

export interface ClinicalMeasurementResult {
  readonly measurementId: string;
  readonly measurementType: AnalysisTypeId;
  readonly sourceRevision: number;
  readonly sourceObjectIds: readonly string[];
  readonly geometricReferences: readonly string[];
  readonly value: AnalysisMeasurementValue;
  readonly validity: AnalysisValidationState;
  readonly confidence?: number | undefined;
  readonly warnings: readonly string[];
  readonly computationVersion: string;
  readonly timestamp: number;
  readonly distanceKind?: DistanceKind | undefined;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface ClinicalAnalysisResult {
  readonly analysisId: string;
  readonly analysisType: AnalysisTypeId;
  readonly sourceRevision: number;
  readonly segmentationRevision: number | undefined;
  readonly geometryFingerprint: string | undefined;
  readonly algorithmVersion: string;
  readonly validity: AnalysisValidationState;
  readonly confidence?: number | undefined;
  readonly warnings: readonly string[];
  readonly measurements: readonly ClinicalMeasurementResult[];
  readonly frames?: readonly AnalysisFrame[] | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
  readonly decisionSupportOnly: true;
}

export const ANALYSIS_ALGORITHM_VERSIONS = Object.freeze({
  distance: '1.0.0',
  angle: '1.0.0',
  tooth: '1.0.0',
  toothFrame: '1.0.0',
  arch: '1.0.0',
  spacing: '1.0.0',
  crowding: '1.0.0',
  archWidth: '1.0.0',
  bolton: '1.0.0',
  collision: '1.0.0',
  occlusion: '1.0.0',
  surfacePath: '1.0.0'
});

export const createMeasurementId = (prefix: string, now: number): string =>
  `${prefix}-${String(now)}`;

export const createAnalysisId = (prefix: string, now: number): string =>
  `analysis-${prefix}-${String(now)}`;
