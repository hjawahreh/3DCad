/**
 * CLN-WORKSTATION-001 — Trim interaction states + clinician-facing copy.
 */

import type { ClinicalTrimState, TrimDrawMode } from './ClinicalTrimState.js';
import { isStrokeTrimMode } from './ClinicalTrimState.js';

export type TrimInteractionState =
  | 'EMPTY'
  | 'ARMED'
  | 'DRAWING'
  | 'CLOSED'
  | 'VALIDATING'
  | 'PREVIEWING'
  | 'PREVIEW_READY'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'ERROR'
  | 'IDLE'
  | 'FREEHAND_ARMED'
  | 'POLYLINE_ARMED';

export interface TrimBoundaryValidity {
  readonly closed: boolean;
  readonly surfaceHitsOnly: boolean;
  readonly connected: boolean;
  readonly nonSelfIntersecting: boolean;
  readonly validationPassed: boolean;
  readonly regionSelected: boolean;
  readonly previewExists: boolean;
  readonly previewMeaningfulDelta: boolean;
  readonly fingerprintChanged: boolean;
  readonly previewQualityPassed: boolean;
}

export const isBoundaryClinicallyValid = (v: TrimBoundaryValidity): boolean =>
  v.closed &&
  v.surfaceHitsOnly &&
  v.connected &&
  v.nonSelfIntersecting &&
  v.validationPassed &&
  v.regionSelected &&
  v.previewExists &&
  v.previewMeaningfulDelta &&
  v.fingerprintChanged &&
  v.previewQualityPassed;

export const deriveTrimInteractionState = (input: {
  readonly state: ClinicalTrimState;
  readonly previewReady: boolean;
  readonly pointerDrawing: boolean;
  readonly committed?: boolean;
  readonly validating?: boolean;
  readonly previewing?: boolean;
}): TrimInteractionState => {
  const { state, previewReady, pointerDrawing } = input;
  if (state.phase === 'cancelled' || state.lifecycle === 'cancelled') {
    return 'ERROR';
  }
  if (input.committed === true || state.phase === 'completed') {
    return 'COMMITTED';
  }
  if (
    state.phase === 'submitting' ||
    state.phase === 'executing' ||
    state.phase === 'committing'
  ) {
    if (input.previewing === true) return 'PREVIEWING';
    if (input.validating === true) return 'VALIDATING';
    return 'COMMITTING';
  }
  if (previewReady) {
    return 'PREVIEW_READY';
  }
  if (pointerDrawing || state.pointerCaptured) {
    return 'DRAWING';
  }
  if (state.closed && state.points.length >= 3) {
    return 'CLOSED';
  }
  if (isStrokeTrimMode(state.drawMode) || state.drawMode === 'plane') {
    return 'ARMED';
  }
  if (state.points.length === 0) {
    return 'EMPTY';
  }
  return 'EMPTY';
};

/** Guided copy — no engine jargon. */
export const trimGuidedMessage = (
  interaction: TrimInteractionState,
  drawMode: TrimDrawMode
): string => {
  switch (interaction) {
    case 'EMPTY':
    case 'IDLE':
      return 'Choose Lasso or Curve, then draw on the scan.';
    case 'ARMED':
    case 'FREEHAND_ARMED':
    case 'POLYLINE_ARMED':
      if (drawMode === 'lasso' || drawMode === 'freehand') {
        return 'Draw around the area to remove — release to trim.';
      }
      if (drawMode === 'curve' || drawMode === 'polyline') {
        return 'Draw a smooth curve — release to trim.';
      }
      if (drawMode === 'plane') {
        return 'Adjust the cutting plane, then Done.';
      }
      return 'Choose Lasso or Curve, then draw on the scan.';
    case 'DRAWING':
      return 'Keep drawing — release when finished.';
    case 'CLOSED':
    case 'VALIDATING':
    case 'PREVIEWING':
      return 'Trimming…';
    case 'PREVIEW_READY':
      return 'Trim ready — Undo if needed.';
    case 'COMMITTING':
      return 'Applying trim…';
    case 'COMMITTED':
      return 'Trim complete.';
    case 'ERROR':
      return 'Something went wrong — Clear and try again.';
    default:
      return 'Choose Lasso or Curve, then draw on the scan.';
  }
};

export const trimInteractionStatusMessage = (
  interaction: TrimInteractionState,
  _pointCount: number
): string => trimGuidedMessage(interaction, 'idle');
