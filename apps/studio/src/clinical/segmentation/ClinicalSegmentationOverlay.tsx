/**
 * Segmentation overlay — processing, rebuild, review, failure (CLN-SEG-001).
 * Stages only — no fake percentages. No engineering diagnostics in the primary path.
 */

import type { JSX } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { toothInspectorModel } from './display/ClinicalSegmentationPresentation.js';
import { resolveSegmentationClinicalStatus } from './status/SegmentationClinicalStatus.js';
import { isNonClinicalSegmentationProvider } from './ClinicalSegmentationIntegrity.js';
import {
  productionLifecycleToReviewKind,
  productionLifecycleUiLabel
} from './runtime/ProductionSegmentationLifecycle.js';

const isProcessingPhase = (phase: string): boolean =>
  phase === 'activating' ||
  phase === 'preparing' ||
  phase === 'inferencing' ||
  phase === 'postprocessing' ||
  phase === 'validating';

export const ClinicalSegmentationOverlay = (props: {
  readonly workspace: ClinicalWorkspace;
}): JSX.Element | null => {
  const { workspace } = props;
  useClinicalUiRevision(workspace.session);
  const runtime = workspace.segmentation;
  if (!runtime.isActive()) {
    return null;
  }
  const state = runtime.session.getState();
  const presentation = state.presentation;
  const pred = state.prediction;
  const doc = workspace.session.getPublicState().activeCase;
  const target = doc?.objects.find((o) => o.id === state.targetObjectId);
  const archLabel =
    target?.archRole === 'upper' ? 'Upper Arch' : target?.archRole === 'lower' ? 'Lower Arch' : 'Active arch';
  const archRole = target?.archRole === 'upper' || target?.archRole === 'lower' ? target.archRole : undefined;
  const isReference = isNonClinicalSegmentationProvider(state.providerId);

  if (presentation === 'failed' || state.phase === 'failed') {
    const msg = state.errorMessage ?? 'Segmentation could not be completed.';
    const lifecycleLabel = productionLifecycleUiLabel(state.productionLifecycle);
    return (
      <div
        className="clinical-segmentation-overlay clinical-segmentation-overlay--failed"
        data-testid="clinical-segmentation-overlay"
        data-phase="failed"
        data-lifecycle={state.productionLifecycle}
        data-review-kind={productionLifecycleToReviewKind(state.productionLifecycle)}
      >
        <div className="clinical-segmentation-overlay__panel">
          <strong>Segmentation could not be completed.</strong>
          <span className="muted" data-testid="clinical-seg-lifecycle-label">
            {lifecycleLabel}
          </span>
          <span className="muted">{msg}</span>
          <span className="muted">The original scan is unchanged.</span>
          <div className="clinical-segmentation-overlay__actions">
            <button
              type="button"
              className="clinical-btn clinical-btn--primary"
              data-testid="clinical-segmentation-retry"
              onClick={() => void runtime.runInference()}
            >
              Retry
            </button>
            <button
              type="button"
              className="clinical-btn clinical-btn--secondary"
              onClick={() => runtime.cancel()}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (presentation === 'segmenting' || (isProcessingPhase(state.phase) && pred === undefined)) {
    return (
      <div
        className="clinical-segmentation-overlay clinical-segmentation-overlay--processing"
        data-testid="clinical-segmentation-overlay"
        data-phase={state.phase}
        data-lifecycle={state.productionLifecycle}
        data-review-kind={productionLifecycleToReviewKind(state.productionLifecycle)}
        data-processing="true"
      >
        <div className="clinical-segmentation-overlay__hero">
          <p className="clinical-segmentation-overlay__eyebrow">
            {isReference
              ? 'REFERENCE HEURISTIC'
              : state.productionLifecycle === 'INITIALIZING'
                ? 'LOADING MODEL'
                : 'AUTO SEGMENTATION'}
          </p>
          <h2>Identifying teeth and gingiva</h2>
          <p
            className="clinical-segmentation-overlay__stage"
            data-testid="clinical-segmentation-stage"
          >
            {state.progress?.message ??
              (state.productionLifecycle === 'INITIALIZING'
                ? 'Loading production model…'
                : 'Preparing model')}
          </p>
          <p className="muted" data-testid="clinical-seg-lifecycle-label">
            {productionLifecycleUiLabel(state.productionLifecycle)}
          </p>
          <p className="muted">{archLabel}</p>
        </div>
      </div>
    );
  }

  if (presentation === 'rebuilding') {
    return (
      <div
        className="clinical-segmentation-overlay clinical-segmentation-overlay--rebuilding"
        data-testid="clinical-segmentation-overlay"
        data-phase="rebuilding"
      >
        <div className="clinical-segmentation-overlay__hero">
          <p className="clinical-segmentation-overlay__eyebrow">Rebuilding…</p>
          <h2>Rebuilding tooth regions</h2>
        </div>
      </div>
    );
  }

  if (state.phase === 'ready-for-review' && pred !== undefined) {
    const selected = pred.instances.find((i) => i.instanceId === state.selectedInstanceId);
    const status = resolveSegmentationClinicalStatus({
      providerId: pred.providerId,
      needsClinicalReview: pred.confidence.needsReviewCount > 0
    });
    return (
      <div
        className="clinical-segmentation-overlay clinical-segmentation-overlay--review clinical-segmentation-overlay--review-compact"
        data-testid="clinical-segmentation-overlay"
        data-phase="ready-for-review"
        data-lifecycle={state.productionLifecycle}
        data-review-kind={productionLifecycleToReviewKind(state.productionLifecycle)}
      >
        <div className="clinical-segmentation-overlay__panel">
          <strong>Review</strong>
          <span data-testid="clinical-seg-review-status">{status}</span>
          <span className="muted" data-testid="clinical-seg-lifecycle-label">
            {productionLifecycleUiLabel(state.productionLifecycle)}
          </span>
          <span className="muted">
            {String(pred.instances.length)} teeth · use Tooth Numbering to select
          </span>
          {selected !== undefined ? (
            <div
              className="clinical-segmentation-overlay__selected"
              data-testid="clinical-segmentation-selected"
            >
              {(() => {
                const model = toothInspectorModel(selected, archRole);
                return (
                  <>
                    <strong>FDI {model.identity}</strong>
                    <span>Confidence: {model.confidenceLabel}</span>
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
};
