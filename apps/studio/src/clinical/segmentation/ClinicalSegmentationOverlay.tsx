/**
 * Segmentation overlay — review status (non-destructive visualization).
 */

import type { JSX } from 'react';
import { bandLabel } from './prediction/types.js';
import type { ClinicalSegmentationSession } from './ClinicalSegmentationSession.js';

const PHASE_LABEL: Readonly<Record<string, string>> = Object.freeze({
  activating: 'Preparing model…',
  preparing: 'Preparing model…',
  inferencing: 'Segmenting teeth…',
  postprocessing: 'Refining boundaries…',
  validating: 'Checking results…',
  'ready-for-review': 'Review teeth',
  committing: 'Saving results…',
  failed: 'Segmentation failed',
  cancelled: 'Cancelled'
});

export const ClinicalSegmentationOverlay = (props: {
  readonly session: ClinicalSegmentationSession;
}): JSX.Element | null => {
  const state = props.session.getState();
  if (state.phase === 'idle' || state.phase === 'complete' || state.phase === 'cancelled') {
    return null;
  }
  const pred = state.prediction;
  return (
    <div className="clinical-segmentation-overlay" data-phase={state.phase}>
      <div className="clinical-segmentation-overlay__status">
        <strong>Segment Teeth</strong>
        <span>{PHASE_LABEL[state.phase] ?? state.phase}</span>
        {state.progress?.message !== undefined ? <span>{state.progress.message}</span> : null}
        {state.errorMessage !== undefined ? (
          <span className="clinical-segmentation-overlay__error">{state.errorMessage}</span>
        ) : null}
        {pred !== undefined ? (
          <span>
            {String(pred.instances.length)} teeth · {bandLabel(pred.confidence.caseBand)} confidence
          </span>
        ) : null}
      </div>
    </div>
  );
};
