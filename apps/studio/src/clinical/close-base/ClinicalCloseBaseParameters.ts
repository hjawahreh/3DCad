/**
 * ClinicalCloseBaseParameters — immutable close-base parameter snapshot.
 */

import type { CloseBaseOrientation, CloseBaseStrategyId } from './ClinicalCloseBaseStrategy.js';

export interface ClinicalCloseBaseParameters {
  readonly strategy: CloseBaseStrategyId;
  /** Base height (mm). */
  readonly height: number;
  /** Wall / shell thickness (mm). */
  readonly thickness: number;
  readonly orientation: CloseBaseOrientation;
  /**
   * Clinical offset from the trimmed boundary (mm).
   * Stored as `margin` for kernel compatibility.
   */
  readonly margin: number;
  /** Reserved — not applied until a remesh path exists. */
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

/** Defaults tuned for clinical Y-up frame (inferior base along −Y → xz plane). */
export const DEFAULT_CLOSE_BASE_PARAMETERS: ClinicalCloseBaseParameters = Object.freeze({
  strategy: 'plane',
  height: 3,
  thickness: 1.5,
  orientation: 'xz',
  margin: 0.3,
  smoothing: false
});

/** Auto Close Base clinical defaults. */
export const AUTO_CLOSE_BASE_PARAMETERS: ClinicalCloseBaseParameters = Object.freeze({
  strategy: 'plane',
  height: 3.5,
  thickness: 1.5,
  orientation: 'xz',
  margin: 0.35,
  smoothing: false
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const sanitizeCloseBaseParameters = (
  partial: Partial<ClinicalCloseBaseParameters> & { readonly offset?: number },
  current: ClinicalCloseBaseParameters = DEFAULT_CLOSE_BASE_PARAMETERS
): ClinicalCloseBaseParameters => {
  const limits = CLOSE_BASE_PARAMETER_LIMITS;
  const strategy = partial.strategy ?? current.strategy;
  const normalized: CloseBaseStrategyId =
    strategy === 'surface' ? 'surface' : strategy === 'offset' ? 'offset' : 'plane';
  const marginSource =
    partial.offset !== undefined
      ? partial.offset
      : (partial.margin ?? current.margin);
  return Object.freeze({
    strategy: normalized,
    height: clamp(partial.height ?? current.height, limits.heightMin, limits.heightMax),
    thickness: clamp(
      partial.thickness ?? current.thickness,
      limits.thicknessMin,
      limits.thicknessMax
    ),
    orientation: partial.orientation ?? current.orientation,
    margin: clamp(marginSource, limits.marginMin, limits.marginMax),
    smoothing: partial.smoothing ?? current.smoothing
  });
};

export const describeCloseBaseParameters = (params: ClinicalCloseBaseParameters): string =>
  `${params.strategy} · height ${String(params.height)} · thickness ${String(params.thickness)} · offset ${String(params.margin)}`;
