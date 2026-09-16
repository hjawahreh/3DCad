/**
 * CLN-001A — upstream→downstream error propagation notes (honest, no fake coupling scores).
 */

export interface ClinicalErrorPropagationLink {
  readonly fromStage: string;
  readonly toStage: string;
  readonly fromMetric: string | null;
  readonly toMetric: string | null;
  readonly observed: boolean;
  readonly notes: string;
}

/**
 * Record whether measured upstream errors are available to correlate with downstream.
 * Without paired GT at both stages, correlation is NOT_AVAILABLE.
 */
export const buildErrorPropagationChain = (input: {
  readonly orientationAxisErrorDeg?: number | null;
  readonly trimBoundaryMeanMm?: number | null;
  readonly baseSurfaceMeanMm?: number | null;
  readonly segmentationTsa?: number | null;
}): readonly ClinicalErrorPropagationLink[] => {
  const hasOrient = input.orientationAxisErrorDeg != null;
  const hasTrim = input.trimBoundaryMeanMm != null;
  const hasBase = input.baseSurfaceMeanMm != null;
  const hasSeg = input.segmentationTsa != null;

  return Object.freeze([
    Object.freeze({
      fromStage: 'orientation',
      toStage: 'trim',
      fromMetric: hasOrient ? String(input.orientationAxisErrorDeg) : null,
      toMetric: hasTrim ? String(input.trimBoundaryMeanMm) : null,
      observed: hasOrient && hasTrim,
      notes:
        hasOrient && hasTrim
          ? 'Paired orientation+trim GT present — correlate in offline analysis'
          : 'NOT_AVAILABLE — need GT at both stages'
    }),
    Object.freeze({
      fromStage: 'trim',
      toStage: 'close-base',
      fromMetric: hasTrim ? String(input.trimBoundaryMeanMm) : null,
      toMetric: hasBase ? String(input.baseSurfaceMeanMm) : null,
      observed: hasTrim && hasBase,
      notes:
        hasTrim && hasBase
          ? 'Paired trim+base GT present — correlate in offline analysis'
          : 'NOT_AVAILABLE — need GT at both stages'
    }),
    Object.freeze({
      fromStage: 'close-base',
      toStage: 'segmentation',
      fromMetric: hasBase ? String(input.baseSurfaceMeanMm) : null,
      toMetric: hasSeg ? String(input.segmentationTsa) : null,
      observed: hasBase && hasSeg,
      notes:
        hasBase && hasSeg
          ? 'Paired base+segmentation GT present — correlate in offline analysis'
          : 'NOT_AVAILABLE — need GT at both stages'
    })
  ]);
};
