/**
 * CLN-WORKSTATION-001 — compact Segmentation panel.
 * Primary: Auto Segmentation (Beta). Secondary: Review / Accept / Reject.
 * Never claims clinical validation accuracy.
 */

import type { JSX } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalArchSwitcher } from '../shell/ClinicalArchSwitcher.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { SegmentationViewMode } from './ClinicalSegmentationSession.js';

const REVIEW_MODES: readonly { readonly id: SegmentationViewMode; readonly label: string }[] =
  Object.freeze([
    { id: 'semantic', label: 'Semantic' },
    { id: 'instance', label: 'Teeth' },
    { id: 'review', label: 'Review' }
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
  const acceptBlocked = state.phase !== 'ready-for-review' || validationFail;
  const inReview = state.phase === 'ready-for-review' || state.prediction !== undefined;

  return (
    <div
      className="clinical-segmentation-toolbar clinical-segmentation-toolbar--workstation"
      role="toolbar"
      aria-label="Segmentation"
      data-testid="clinical-segmentation-toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="clinical-segmentation-toolbar__header">
        <span className="clinical-segmentation-toolbar__label">Segment</span>
        <span
          className="clinical-segmentation-toolbar__disclaimer"
          data-testid="clinical-seg-disclaimer"
        >
          Auto Segmentation (Beta)
        </span>
      </div>

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
            workspace.session
              .getHost()
              .notifications.push('warning', 'Segmentation', result.error.message);
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
        Auto Segmentation
      </button>

      {inReview ? (
        <>
          <div className="clinical-segmentation-toolbar__modes" role="group" aria-label="Review">
            {REVIEW_MODES.map((m) => (
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
          <button
            type="button"
            className="clinical-btn clinical-btn--primary"
            disabled={acceptBlocked}
            title={
              validationFail ? 'Accept blocked — segmentation validation FAIL' : undefined
            }
            data-testid="clinical-segmentation-accept"
            onClick={() => void runtime.accept()}
          >
            Accept
          </button>
          <button
            type="button"
            className="clinical-btn clinical-btn--secondary"
            disabled={busy}
            data-testid="clinical-segmentation-reject"
            onClick={() => runtime.reject()}
          >
            Reject / Retry
          </button>
        </>
      ) : null}

      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        disabled={busy}
        onClick={() => runtime.cancel()}
      >
        Done
      </button>
    </div>
  );
};
