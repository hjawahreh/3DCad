import { useSyncExternalStore, useState } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  PREPARATION_STAGE_ORDER,
  STAGE_LABELS
} from '../preparation/ClinicalPreparationStage.js';
import { toUserFacingStatus } from './ClinicalWorkflowPresentation.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

const STAGE_USER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'Orientation Complete': 'Orientation complete',
  'Ready For Trim': 'Ready to trim',
  'Ready For Close Base': 'Ready to close base',
  'Ready For Segmentation': 'Ready to segment',
  'Ready For Movement': 'Not Ready for Movement',
  'Preparation Complete': 'Preparation complete'
});

/**
 * Advanced preparation controls — kept for power users; hidden behind details in the left panel.
 */
export const ClinicalPreparationPanel = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const prep = workspace.preparation;
  const state = useSyncExternalStore(
    (cb) => prep.session.subscribe(cb),
    () => prep.session.getState(),
    () => prep.session.getState()
  );
  const tools = prep.manager.pipeline.toolsForStage(state.currentStage);
  const [showDev, setShowDev] = useState(false);

  const run = (action: () => void) => (): void => {
    action();
    session.notifyUi();
  };

  return (
    <div className="clinical-preparation-panel" data-testid="clinical-preparation-panel">
      <header className="clinical-preparation-panel__header">
        <h2>Preparation</h2>
        <span
          className={`clinical-preparation-status clinical-preparation-status--${state.workflowPhase}`}
          data-testid="clinical-preparation-status"
        >
          {toUserFacingStatus(state.statusMessage)}
        </span>
        <span
          className="muted"
          data-testid="clinical-preparation-auto-ui"
        >
          {state.autoUiState === 'ready'
            ? 'Ready'
            : state.autoUiState === 'warning'
              ? 'Ready with warnings'
              : state.autoUiState === 'failed'
                ? 'Failed'
                : state.autoUiState === 'preparing' || state.autoUiState === 'analyzing'
                  ? 'Preparing…'
                  : 'Not started'}
        </span>
      </header>

      {session.getPublicState().activeCase?.orientationMeta?.acceptedAt !== undefined ? (
        <p className="muted" data-testid="clinical-preparation-orient-meta">
          Clinical orientation accepted
          {session.getPublicState().activeCase?.orientationMeta?.confidence
            ? ` · ${session.getPublicState().activeCase?.orientationMeta?.confidence ?? ''} confidence`
            : ''}
          . Source geometry unchanged; working meshes prepared for trim.
        </p>
      ) : null}

      {state.autoReport?.arches.some((a) => a.anatomy !== undefined) === true ? (
        <section
          className="clinical-preparation-section"
          aria-label="Arch anatomy"
          data-testid="clinical-arch-anatomy"
        >
          <h3>Arch anatomy</h3>
          <p className="muted">
            Geometry-driven cues only — not clinical tooth identity.
          </p>
          <ul className="clinical-arch-anatomy__list">
            {state.autoReport.arches.map((arch) => {
              const a = arch.anatomy;
              if (a === undefined) return null;
              return (
                <li key={arch.objectId} data-testid={`clinical-arch-anatomy-${arch.objectId}`}>
                  <strong>
                    {arch.archRole === 'upper'
                      ? 'Upper Arch'
                      : arch.archRole === 'lower'
                        ? 'Lower Arch'
                        : arch.displayName}
                  </strong>
                  <span className="muted">
                    {' '}
                    · role {a.archRole}/{a.archConfidence}
                    {' · '}frame {a.frameConfidence}
                    {' · '}occlusal {a.occlusalConfidence}
                    {' · '}
                    {String(a.candidateCount)} tooth-region candidate(s)
                    {' · '}
                    {String(a.dentalRegionCount)} dental region(s)
                  </span>
                  {arch.anatomyReport?.warnings.length ? (
                    <ul className="clinical-arch-anatomy__warnings">
                      {arch.anatomyReport.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="clinical-preparation-section">
        <h3>Progress</h3>
        {state.autoSteps.length > 0 ? (
          <ul className="clinical-preparation-auto-steps" data-testid="clinical-preparation-auto-steps">
            {state.autoSteps.map((step) => (
              <li key={step.id} className={step.done ? 'done' : undefined}>
                {step.done ? '✓ ' : '○ '}
                {step.label}
              </li>
            ))}
          </ul>
        ) : (
          <div className="clinical-preparation-progress" data-testid="clinical-preparation-progress">
            <div
              className="clinical-preparation-progress__bar"
              style={{
                width: `${String(Math.round((state.completedStages.length / PREPARATION_STAGE_ORDER.length) * 100))}%`
              }}
            />
          </div>
        )}
        <p className="clinical-preparation-next muted" data-testid="clinical-preparation-next">
          {state.autoUiState === 'ready' || state.autoUiState === 'warning'
            ? state.autoReport?.message ?? toUserFacingStatus(state.nextStep)
            : `Next: ${toUserFacingStatus(state.nextStep)}`}
        </p>
        {state.autoUiState === 'failed' ? (
          <p className="clinical-import-dialog__error" data-testid="clinical-preparation-error">
            {state.statusMessage}
          </p>
        ) : null}
        {state.lastFailure !== undefined && import.meta.env.DEV ? (
          <pre
            className="clinical-preparation-failure-diag"
            data-testid="clinical-preparation-failure-diag"
          >
            {`Preparation Session Creation Failed
stage: ${state.lastFailure.stage}
reason: ${state.lastFailure.reason}
caseId: ${state.lastFailure.caseId ?? '—'}
arch: ${state.lastFailure.arch ?? '—'}
geometryRevision: ${state.lastFailure.geometryRevision ?? '—'}`}
          </pre>
        ) : null}
      </section>

      <section className="clinical-preparation-section">
        <h3>Stages</h3>
        <div className="clinical-preparation-stages" data-testid="clinical-preparation-stages">
          {PREPARATION_STAGE_ORDER.map((stage) => (
            <span
              key={stage}
              className={
                stage === state.currentStage
                  ? 'clinical-preparation-stage clinical-preparation-stage--current'
                  : state.completedStages.includes(stage)
                    ? 'clinical-preparation-stage clinical-preparation-stage--done'
                    : 'clinical-preparation-stage'
              }
            >
              {STAGE_USER_LABELS[STAGE_LABELS[stage]] ?? STAGE_LABELS[stage]}
            </span>
          ))}
        </div>
      </section>

      {state.validationReport !== undefined ? (
        <section className="clinical-preparation-section">
          <h3>Checks</h3>
          <ul className="clinical-preparation-validation" data-testid="clinical-preparation-validation">
            {state.validationReport.checks.map((check) => (
              <li
                key={check.id}
                className={
                  check.passed
                    ? 'clinical-preparation-validation__item clinical-preparation-validation__item--pass'
                    : 'clinical-preparation-validation__item clinical-preparation-validation__item--fail'
                }
              >
                <strong>{check.label}</strong>
                <span className="muted"> — {check.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="clinical-preparation-actions">
        <button
          type="button"
          className="clinical-preparation-btn clinical-preparation-btn--accept"
          onClick={run(() => {
            const result = prep.autoPrepare();
            if (!result.ok) {
              session.getHost().notifications.push('warning', 'Preparation', result.error.message);
            }
          })}
        >
          Prepare Case
        </button>
        <button
          type="button"
          className="clinical-preparation-btn clinical-preparation-btn--accept"
          disabled={!prep.isReadyForGeometry()}
          title={
            prep.isReadyForGeometry()
              ? 'Continue to Trim'
              : 'Prepare the case first'
          }
          onClick={run(() => {
            void session.getHost().commands.invoke('clinical.tool.trim');
          })}
        >
          Continue to Trim
        </button>
        <button
          type="button"
          className="clinical-preparation-btn clinical-preparation-btn--cancel"
          onClick={run(() => prep.cancel())}
        >
          Cancel
        </button>
      </footer>

      <button
        type="button"
        className="clinical-link"
        onClick={() => {
          setShowDev((v) => !v);
        }}
      >
        {showDev ? 'Hide developer controls' : 'Show developer controls'}
      </button>

      {showDev ? (
        <section className="clinical-preparation-section clinical-preparation-section--dev">
          <h3>Developer</h3>
          <p data-testid="clinical-preparation-current-tool">
            Tool: {state.activeTool ?? state.selectedTool ?? 'None'}
          </p>
          <div className="clinical-preparation-tools">
            {tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={
                  state.selectedTool === tool.id
                    ? 'clinical-preparation-tool clinical-preparation-tool--selected'
                    : 'clinical-preparation-tool'
                }
                onClick={run(() => {
                  prep.selectTool(tool.id);
                })}
              >
                {tool.title}
              </button>
            ))}
          </div>
          <div className="clinical-preparation-actions">
            <button
              type="button"
              className="clinical-preparation-btn"
              onClick={run(() => prep.activateSession())}
            >
              Activate Session
            </button>
            <button
              type="button"
              className="clinical-preparation-btn"
              onClick={run(() => prep.activateTool())}
            >
              Orchestrate Tool
            </button>
            <button
              type="button"
              className="clinical-preparation-btn"
              onClick={run(() => prep.advanceStage())}
            >
              Advance Stage
            </button>
          </div>
          <ol className="clinical-preparation-timeline" data-testid="clinical-preparation-timeline">
            <li className="muted">Workflow phase: {state.workflowPhase}</li>
          </ol>
        </section>
      ) : null}
    </div>
  );
};
