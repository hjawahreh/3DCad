/**
 * Segmentation overlay — processing, rebuild, review, failure (Phase 8).
 * Does not expose provider implementation details.
 */

import type { JSX } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { summarizeReview, toothInspectorModel } from './display/ClinicalSegmentationPresentation.js';

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
  const summary = pred !== undefined ? summarizeReview(pred) : undefined;
  const doc = workspace.session.getPublicState().activeCase;
  const target = doc?.objects.find((o) => o.id === state.targetObjectId);
  const archLabel =
    target?.archRole === 'upper' ? 'Upper Arch' : target?.archRole === 'lower' ? 'Lower Arch' : 'Active arch';
  const archRole = target?.archRole === 'upper' || target?.archRole === 'lower' ? target.archRole : undefined;

  const progressPct =
    state.progress !== undefined && state.progress.total > 0
      ? Math.min(100, Math.round((state.progress.completed / state.progress.total) * 100))
      : presentation === 'rebuilding'
        ? 92
        : isProcessingPhase(state.phase)
          ? 8
          : 0;

  if (presentation === 'failed' || state.phase === 'failed') {
    return (
      <div
        className="clinical-segmentation-overlay clinical-segmentation-overlay--failed"
        data-testid="clinical-segmentation-overlay"
        data-phase="failed"
      >
        <div className="clinical-segmentation-overlay__panel">
          <strong>Segmentation could not be completed.</strong>
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
              data-testid="clinical-segmentation-choose-model"
              onClick={() => {
                const ops = runtime.registry.listOperational();
                const cur = state.providerId;
                const idx = ops.findIndex((p) => p.info.id === cur);
                const next = ops[(idx + 1) % Math.max(1, ops.length)];
                if (next !== undefined) {
                  runtime.setProvider(next.info.id);
                  workspace.session.getHost().notifications.push(
                    'info',
                    'Segmentation',
                    `Provider: ${next.info.displayName}`
                  );
                }
              }}
            >
              Choose Another Model
            </button>
            <button
              type="button"
              className="clinical-btn clinical-btn--tertiary"
              data-testid="clinical-segmentation-diagnostics"
              onClick={() => {
                const snap = runtime.diagnostics.snapshot();
                workspace.session.getHost().notifications.push(
                  'info',
                  'Segmentation diagnostics',
                  JSON.stringify(snap)
                );
              }}
            >
              Review Diagnostics
            </button>
            <button
              type="button"
              className="clinical-btn clinical-btn--tertiary"
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
      >
        <div className="clinical-segmentation-overlay__hero">
          <p className="clinical-segmentation-overlay__eyebrow">Segmenting case</p>
          <h2>Reconstructing dental anatomy</h2>
          <p className="clinical-segmentation-overlay__stage">
            {state.progress?.message ?? 'Preparing dental surface'}
          </p>
          <div
            className="clinical-segmentation-overlay__bar"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="clinical-segmentation-overlay__bar-fill"
              style={{ width: `${String(progressPct)}%` }}
            />
          </div>
          <p className="clinical-segmentation-overlay__pct">{String(progressPct)}%</p>
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
          <h2>Reconstructing teeth and gingiva</h2>
          <div
            className="clinical-segmentation-overlay__bar"
            role="progressbar"
            aria-valuenow={92}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="clinical-segmentation-overlay__bar-fill" style={{ width: '92%' }} />
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === 'ready-for-review' && summary !== undefined && pred !== undefined) {
    const selected = pred.instances.find((i) => i.instanceId === state.selectedInstanceId);
    return (
      <div
        className="clinical-segmentation-overlay clinical-segmentation-overlay--review"
        data-testid="clinical-segmentation-overlay"
        data-phase="ready-for-review"
      >
        <div className="clinical-segmentation-overlay__panel">
          <strong>Segmentation complete</strong>
          <span>
            Detected: <b>{String(summary.toothCount)}</b> teeth
          </span>
          <span>
            Needs review: <b>{String(summary.needsReviewCount)}</b>
          </span>
          {summary.needsReviewCount > 0 && !state.reviewAcknowledged ? (
            <span className="clinical-segmentation-overlay__warn" data-testid="clinical-segmentation-review-required">
              Review required
            </span>
          ) : null}
          {summary.needsReviewCount > 0 && !state.reviewAcknowledged ? (
            <button
              type="button"
              className="clinical-btn clinical-btn--secondary"
              onClick={() => runtime.acknowledgeReview()}
            >
              Acknowledge Review Required
            </button>
          ) : null}
          {summary.unknownCount > 0 ? (
            <span className="clinical-segmentation-overlay__warn">
              Unknown: {String(summary.unknownCount)}
            </span>
          ) : null}
          {summary.missingCount > 0 ? (
            <span className="muted">Missing slots: {String(summary.missingCount)}</span>
          ) : null}
          <span className="muted">{summary.qualityLabel}</span>
          <p className="clinical-segmentation-overlay__hint">Review Teeth</p>
          <ul className="clinical-segmentation-tooth-list" data-testid="clinical-segmentation-tooth-list">
            {pred.instances.map((t) => {
              const fdi = t.identification.fdi;
              const label = fdi !== undefined ? String(fdi) : '—';
              const needs =
                t.identification.status === 'UNCERTAIN' ||
                t.identification.status === 'UNKNOWN' ||
                t.confidence < 0.5;
              return (
                <li key={t.instanceId}>
                  <button
                    type="button"
                    className={
                      state.selectedInstanceId === t.instanceId
                        ? 'clinical-link clinical-link--active'
                        : 'clinical-link'
                    }
                    onClick={() => runtime.selectInstance(t.instanceId)}
                  >
                    {needs ? (
                      <span
                        className="clinical-segmentation-badge clinical-segmentation-badge--warn"
                        title="Needs review"
                      >
                        !
                      </span>
                    ) : (
                      <span className="clinical-segmentation-badge">·</span>
                    )}{' '}
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
          {selected !== undefined ? (
            <div
              className="clinical-segmentation-overlay__selected"
              data-testid="clinical-segmentation-selected"
            >
              {(() => {
                const model = toothInspectorModel(selected, archRole);
                return (
                  <>
                    <strong>{model.title}</strong>
                    <span>Identity {model.identity}</span>
                    <span>Confidence {model.confidenceLabel}</span>
                    <span>Arch {model.archLabel}</span>
                    <span>Review {model.reviewState}</span>
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
