/**
 * Segmentation toolbar — Segment Teeth, modes, arch switcher, accept/reject.
 */

import type { JSX } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalArchSwitcher } from '../shell/ClinicalArchSwitcher.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { SegmentationViewMode } from './ClinicalSegmentationSession.js';

const MODES: readonly { readonly id: SegmentationViewMode; readonly label: string }[] = Object.freeze([
  { id: 'semantic', label: 'Semantic' },
  { id: 'instance', label: 'Instance' },
  { id: 'fdi', label: 'FDI' },
  { id: 'confidence', label: 'Confidence' },
  { id: 'review', label: 'Review' },
  { id: 'boundary', label: 'Boundary' }
]);

export const ClinicalSegmentationToolbar = (props: {
  readonly workspace: ClinicalWorkspace;
}): JSX.Element | null => {
  const { workspace } = props;
  useClinicalUiRevision(workspace.session);
  const runtime = workspace.segmentation;
  if (!runtime.isActive()) {
    return null;
  }
  const state = runtime.session.getState();
  const doc = workspace.session.getPublicState().activeCase;
  const targetObj = doc?.objects.find((o) => o.id === state.targetObjectId);
  const activeArch =
    targetObj?.archRole === 'upper' || targetObj?.archRole === 'lower'
      ? targetObj.archRole
      : undefined;
  const hasUpper = doc?.objects.some((o) => o.archRole === 'upper') === true;
  const hasLower = doc?.objects.some((o) => o.archRole === 'lower') === true;
  const busy =
    state.presentation === 'segmenting' ||
    state.presentation === 'rebuilding' ||
    state.phase === 'preparing' ||
    state.phase === 'inferencing' ||
    state.phase === 'postprocessing';
  const validationFail = state.validationReport?.verdict === 'FAIL';
  const acceptBlocked =
    state.phase !== 'ready-for-review' || validationFail;

  return (
    <div className="clinical-segmentation-toolbar" role="toolbar" aria-label="Segmentation">
      <span className="clinical-segmentation-toolbar__label">Segment Teeth</span>
      <ClinicalArchSwitcher
        active={activeArch}
        hasUpper={hasUpper}
        hasLower={hasLower}
        disabled={busy}
        showBoth={false}
        onSelect={(mode) => {
          if (mode !== 'upper' && mode !== 'lower') {
            return;
          }
          const result = runtime.setActiveArch(mode);
          if (!result.ok) {
            workspace.session.getHost().notifications.push('warning', 'Segmentation', result.error.message);
          }
        }}
        testId="clinical-segmentation-arch"
      />
      <button
        type="button"
        className="clinical-btn clinical-btn--primary"
        disabled={busy}
        data-testid="clinical-segmentation-run"
        onClick={() => void runtime.segmentTeeth()}
      >
        Segment Teeth
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--primary"
        disabled={acceptBlocked}
        title={
          validationFail
            ? 'Accept blocked — segmentation validation FAIL'
            : undefined
        }
        data-testid="clinical-segmentation-accept"
        onClick={() => void runtime.accept()}
      >
        Accept Segmentation
      </button>
      {state.phase === 'ready-for-review' &&
      state.prediction !== undefined &&
      state.prediction.confidence.needsReviewCount > 0 &&
      !state.reviewAcknowledged ? (
        <button
          type="button"
          className="clinical-btn clinical-btn--secondary"
          data-testid="clinical-segmentation-acknowledge-review"
          onClick={() => runtime.acknowledgeReview()}
        >
          Acknowledge Review Required
        </button>
      ) : null}
      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        disabled={busy}
        onClick={() => runtime.cancel()}
      >
        Cancel
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        disabled={busy}
        onClick={() => runtime.reject()}
      >
        Reject
      </button>
      <div className="clinical-segmentation-toolbar__modes" role="group" aria-label="View mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={
              state.viewMode === m.id
                ? 'clinical-btn clinical-btn--tertiary clinical-btn--active'
                : 'clinical-btn clinical-btn--tertiary'
            }
            disabled={state.prediction === undefined}
            data-testid={`clinical-segmentation-mode-${m.id}`}
            onClick={() => runtime.setViewMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <details className="clinical-advanced clinical-advanced--inline">
        <summary>Provider</summary>
        <label>
          Provider
          <select
            value={state.providerId}
            disabled={busy}
            onChange={(e) => runtime.setProvider(e.target.value)}
          >
            {runtime.registry.list().map((p) => (
              <option key={p.info.id} value={p.info.id} disabled={!p.info.operational}>
                {p.info.displayName}
                {!p.info.operational ? ' (unavailable)' : ''}
              </option>
            ))}
          </select>
        </label>
      </details>
    </div>
  );
};
