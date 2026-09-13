/**
 * PROD-002SB — explicit Trim interaction states for toolbar + overlay.
 * Derived from live session/controller — never hardcoded UI claims.
 */

import type { ClinicalTrimState } from './ClinicalTrimState.js';

export type TrimInteractionState =
  | 'IDLE'
  | 'FREEHAND_ARMED'
  | 'POLYLINE_ARMED'
  | 'DRAWING'
  | 'CLOSED'
  | 'PREVIEWING'
  | 'COMMITTING'
  | 'ERROR';

export const deriveTrimInteractionState = (input: {
  readonly state: ClinicalTrimState;
  readonly previewReady: boolean;
  readonly pointerDrawing: boolean;
}): TrimInteractionState => {
  const { state, previewReady, pointerDrawing } = input;
  if (state.phase === 'cancelled' || state.lifecycle === 'cancelled') {
    return 'ERROR';
  }
  if (
    state.phase === 'submitting' ||
    state.phase === 'executing' ||
    state.phase === 'committing'
  ) {
    return 'COMMITTING';
  }
  if (previewReady) {
    return 'PREVIEWING';
  }
  if (pointerDrawing || state.pointerCaptured) {
    return 'DRAWING';
  }
  if (state.closed && state.points.length >= 3) {
    return 'CLOSED';
  }
  if (state.drawMode === 'freehand') {
    return 'FREEHAND_ARMED';
  }
  if (state.drawMode === 'polyline') {
    return 'POLYLINE_ARMED';
  }
  return 'IDLE';
};

export const trimInteractionStatusMessage = (
  interaction: TrimInteractionState,
  pointCount: number
): string => {
  switch (interaction) {
    case 'FREEHAND_ARMED':
      return 'Freehand armed — drag on the scan to draw';
    case 'POLYLINE_ARMED':
      return 'Polyline armed — click the scan to add points';
    case 'DRAWING':
      return `Drawing — ${String(pointCount)} point${pointCount === 1 ? '' : 's'}`;
    case 'CLOSED':
      return `Closed — ${String(pointCount)} points. Validate, then Preview.`;
    case 'PREVIEWING':
      return 'Preview ready — Accept Trim or Cancel Preview';
    case 'COMMITTING':
      return 'Committing trim…';
    case 'ERROR':
      return 'Trim error — Clear and try again';
    case 'IDLE':
    default:
      return 'Choose Freehand or Polyline to arm drawing';
  }
};
