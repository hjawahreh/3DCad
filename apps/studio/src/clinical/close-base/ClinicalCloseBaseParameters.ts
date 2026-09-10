/**
 * ClinicalCloseBaseParameters — immutable close-base parameter snapshot.
 */

import type { CloseBaseOrientation, CloseBaseStrategyId } from './ClinicalCloseBaseStrategy.js';

export interface ClinicalCloseBaseParameters {
  readonly strategy: CloseBaseStrategyId;
  readonly height: number;
  readonly thickness: number;
  readonly orientation: CloseBaseOrientation;
  readonly margin: number;
  readonly smoothing: boolean;
}

export const CLOSE_BASE_PARAMETER_LIMITS = Object.freeze({
  heightMin: 0.5,
  heightMax: 20,
  thicknessMin: 0.5,
  thicknessMax: 10,
  marginMin: 0,
  marginMax: 5
});

export const DEFAULT_CLOSE_BASE_PARAMETERS: ClinicalCloseBaseParameters = Object.freeze({
  strategy: 'plane',
  height: 2,
  thickness: 1.5,
  orientation: 'xy',
  margin: 0.2,
  smoothing: false
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const sanitizeCloseBaseParameters = (
  partial: Partial<ClinicalCloseBaseParameters>,
  current: ClinicalCloseBaseParameters = DEFAULT_CLOSE_BASE_PARAMETERS
): ClinicalCloseBaseParameters => {
  const limits = CLOSE_BASE_PARAMETER_LIMITS;
  const strategy = partial.strategy ?? current.strategy;
  const normalized: CloseBaseStrategyId =
    strategy === 'surface' ? 'surface' : strategy === 'offset' ? 'offset' : 'plane';
  return Object.freeze({
    strategy: normalized,
    height: clamp(partial.height ?? current.height, limits.heightMin, limits.heightMax),
    thickness: clamp(
      partial.thickness ?? current.thickness,
      limits.thicknessMin,
      limits.thicknessMax
    ),
    orientation: partial.orientation ?? current.orientation,
    margin: clamp(partial.margin ?? current.margin, limits.marginMin, limits.marginMax),
    smoothing: partial.smoothing ?? current.smoothing
  });
};

export const describeCloseBaseParameters = (params: ClinicalCloseBaseParameters): string =>
  `${params.strategy} · h ${String(params.height)} · t ${String(params.thickness)} · ${params.orientation}`;
