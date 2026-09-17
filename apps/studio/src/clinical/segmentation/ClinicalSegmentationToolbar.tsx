/**
 * CLN-WORKFLOW-002 — guided Segmentation panel.
 * Edit Scans → Mark Teeth → Auto → Adjust → Verify → Next (Biomech locked).
 */

import type { JSX } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalArchSwitcher } from '../shell/ClinicalArchSwitcher.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { ClinicalToothNumberingPanel } from './ClinicalToothNumberingPanel.js';
import {
  SEGMENTATION_GUIDE_STEPS,
  nextGuideStep,
  prevGuideStep,
  type SegmentationGuideStepId
} from './guide/SegmentationGuideSteps.js';
import { resolveSegmentationClinicalStatus } from './status/SegmentationClinicalStatus.js';
import { isNonClinicalSegmentationProvider } from './ClinicalSegmentationIntegrity.js';
import {
  productionLifecycleToReviewKind,
  productionLifecycleUiLabel
} from './runtime/ProductionSegmentationLifecycle.js';

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
  const isReference = isNonClinicalSegmentationProvider(state.providerId);
  const guideStep = state.guideStep;
  const stepMeta = SEGMENTATION_GUIDE_STEPS.find((s) => s.id === guideStep);
  const clinicalStatus = resolveSegmentationClinicalStatus({
    providerId: state.prediction?.providerId ?? state.providerId,
    needsClinicalReview: (state.prediction?.confidence.needsReviewCount ?? 0) > 0
  });

  const go = (step: SegmentationGuideStepId | undefined): void => {
    if (step === undefined) return;
    runtime.setGuideStep(step);
  };

  return (
    <div
      className="clinical-segmentation-toolbar clinical-segmentation-toolbar--workstation clinical-segmentation-toolbar--guided"
      role="toolbar"
      aria-label="Segmentation"
      data-testid="clinical-segmentation-toolbar"
      data-guide-step={guideStep}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="clinical-segmentation-toolbar__header">
        <span className="clinical-segmentation-toolbar__label">Segment</span>
        <span
          className={
            isReference
              ? 'clinical-segmentation-toolbar__disclaimer clinical-segmentation-toolbar__disclaimer--reference'
              : 'clinical-segmentation-toolbar__disclaimer'
          }
          data-testid="clinical-seg-disclaimer"
        >
          {isReference ? 'BETA / REFERENCE' : 'Production Model'}
        </span>
      </div>

      <div className="clinical-segmentation-guide-steps" data-testid="clinical-seg-guide-steps">
        {SEGMENTATION_GUIDE_STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={
              s.id === guideStep
                ? 'clinical-seg-step clinical-seg-step--current'
                : 'clinical-seg-step'
            }
            data-testid={`clinical-seg-step-${s.id}`}
            disabled={busy}
            onClick={() => go(s.id)}
          >
            {s.shortLabel}
          </button>
        ))}
      </div>

      <p className="clinical-segmentation-toolbar__blurb" data-testid="clinical-seg-blurb">
        <strong>{stepMeta?.label ?? 'Segment'}</strong> — {stepMeta?.description}
      </p>

      <span className="clinical-segmentation-toolbar__status" data-testid="clinical-seg-provider-status">
        {clinicalStatus}
      </span>
      <span
        className="clinical-segmentation-toolbar__lifecycle muted"
        data-testid="clinical-seg-production-lifecycle"
        data-lifecycle={state.productionLifecycle}
        data-review-kind={productionLifecycleToReviewKind(state.productionLifecycle)}
      >
        {productionLifecycleUiLabel(state.productionLifecycle)}
        {state.productionLifecycleDetail ? ` · ${state.productionLifecycleDetail}` : ''}
      </span>

      <ClinicalArchSwitcher
        active={activeArch}
        hasUpper={hasUpper}
        hasLower={hasLower}
        disabled={busy}
        showBoth={guideStep === 'verify-teeth' || guideStep === 'adjust-boundaries'}
        onSelect={(mode) => {
          if (mode !== 'upper' && mode !== 'lower' && mode !== 'both') return;
          if (mode === 'both') {
            workspace.archContext.setMode('both');
            workspace.viewport.showAll();
            workspace.session.notifyUi();
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

      {guideStep === 'mark-teeth' ? (
        <div className="clinical-segmentation-toolbar__markers" data-testid="clinical-seg-markers">
          <span>{String(state.toothMarkers.length)} markers</span>
          <button
            type="button"
            className="clinical-btn clinical-btn--tertiary"
            onClick={() => {
              runtime.session.clearToothMarkers();
              workspace.session.notifyUi();
            }}
          >
            Clear markers
          </button>
        </div>
      ) : null}

      {guideStep === 'auto-segmentation' || guideStep === 'mark-teeth' ? (
        <button
          type="button"
          className="clinical-btn clinical-btn--primary"
          disabled={busy}
          data-testid="clinical-segmentation-run"
          onClick={() => {
            runtime.setGuideStep('auto-segmentation');
            void runtime.segmentTeeth();
          }}
        >
          AUTO SEGMENTATION
        </button>
      ) : null}

      {(guideStep === 'adjust-boundaries' || guideStep === 'verify-teeth') &&
      state.prediction !== undefined ? (
        <>
          <ClinicalToothNumberingPanel workspace={workspace} />
          {guideStep === 'adjust-boundaries' ? (
            <div className="clinical-segmentation-toolbar__actions">
              <button
                type="button"
                className="clinical-btn clinical-btn--tertiary"
                disabled={state.selectedInstanceId === undefined}
                data-testid="clinical-segmentation-mark-unknown"
                onClick={() => {
                  if (state.selectedInstanceId)
                    runtime.markUnknown(state.selectedInstanceId);
                }}
              >
                Mark Unknown
              </button>
            </div>
          ) : null}
          {guideStep === 'verify-teeth' ? (
            <div className="clinical-segmentation-toolbar__actions">
              <button
                type="button"
                className="clinical-btn clinical-btn--primary"
                disabled={acceptBlocked}
                data-testid="clinical-segmentation-accept"
                onClick={() => void runtime.accept()}
              >
                Accept
              </button>
              <button
                type="button"
                className="clinical-btn clinical-btn--secondary"
                disabled={busy}
                data-testid="clinical-segmentation-retry"
                onClick={() => void runtime.runInference()}
              >
                Retry
              </button>
              <button
                type="button"
                className="clinical-btn clinical-btn--secondary"
                disabled={busy}
                data-testid="clinical-segmentation-reject"
                onClick={() => runtime.reject()}
              >
                Reject
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="clinical-segmentation-toolbar__nav">
        <button
          type="button"
          className="clinical-btn clinical-btn--tertiary"
          disabled={busy || prevGuideStep(guideStep) === undefined}
          data-testid="clinical-seg-previous"
          onClick={() => go(prevGuideStep(guideStep))}
        >
          Previous
        </button>
        {guideStep === 'verify-teeth' ? (
          <button
            type="button"
            className="clinical-btn clinical-btn--primary clinical-btn--locked"
            data-testid="clinical-seg-next-biomech"
            disabled
            aria-disabled="true"
            title="Biomechanical planning is locked — not implemented"
            onClick={(e) => {
              e.preventDefault();
              workspace.session.getHost().notifications.push(
                'info',
                'Biomechanical planning',
                'Next stage is locked until biomechanics is enabled.'
              );
            }}
          >
            NEXT (LOCKED)
          </button>
        ) : (
          <button
            type="button"
            className="clinical-btn clinical-btn--primary"
            disabled={busy}
            data-testid="clinical-seg-next"
            onClick={() => {
              if (guideStep === 'auto-segmentation' && state.prediction === undefined) {
                void runtime.segmentTeeth();
                return;
              }
              if (guideStep === 'adjust-boundaries') {
                go('verify-teeth');
                return;
              }
              go(nextGuideStep(guideStep));
            }}
          >
            Next
          </button>
        )}
      </div>

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
