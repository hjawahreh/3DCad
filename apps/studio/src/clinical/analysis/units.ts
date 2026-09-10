/**
 * Clinical analysis units — canonical mm / degrees for computation.
 * Display formatting is separate from computational values.
 */

export type AnalysisLengthUnit = 'mm';
export type AnalysisAngleUnit = 'deg';
export type AnalysisUnit = AnalysisLengthUnit | AnalysisAngleUnit;

export const CANONICAL_LENGTH_UNIT: AnalysisLengthUnit = 'mm';
export const CANONICAL_ANGLE_UNIT: AnalysisAngleUnit = 'deg';

/** Documented floating-point / geometric tolerances for CLN-010. */
export const ANALYSIS_TOLERANCE = Object.freeze({
  lengthEpsilonMm: 1e-6,
  angleEpsilonDeg: 1e-6,
  lengthEqualityMm: 1e-4,
  angleEqualityDeg: 1e-4,
  rigidDistanceMm: 1e-3
});

export const formatLengthMm = (valueMm: number, digits = 2): string =>
  `${valueMm.toFixed(digits)} mm`;

export const formatAngleDeg = (valueDeg: number, digits = 1): string =>
  `${valueDeg.toFixed(digits)}°`;

export const clampDisplay = (value: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};
