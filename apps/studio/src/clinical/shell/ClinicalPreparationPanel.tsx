import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  PREPARATION_STAGE_ORDER,
  STAGE_LABELS
} from '../preparation/ClinicalPreparationStage.js';
import {
  PREPARATION_WORKFLOW_ORDER,
  type PreparationWorkflowPhase
} from '../preparation/ClinicalPreparationWorkflow.js';
import type { PreparationOrchestrationToolId } from '../preparation/ClinicalPreparationPipeline.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

const WORKFLOW_LABELS: Readonly<Record<PreparationWorkflowPhase, string>> = Object.freeze({
  idle: 'Idle',
  'case-ready': 'Case Ready',
  'orientation-validation': 'Orientation Validation',
  'preparation-ready': 'Preparation Ready',
  'tool-selection': 'Tool Selection',
  'preparation-session': 'Preparation Session',
  'tool-activation': 'Tool Activation',
  validation: 'Validation',
  complete: 'Complete',
  'ready-for-geometry': 'Ready For Geometry Tools',
  cancelled: 'Cancelled'
});

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
          {state.statusMessage}
        </span>
      </header>

      <section className="clinical-preparation-section">
        <h3>Progress</h3>
        <div className="clinical-preparation-progress" data-testid="clinical-preparation-progress">
          <div
            className="clinical-preparation-progress__bar"
            style={{
              width: `${String(Math.round((state.completedStages.length / PREPARATION_STAGE_ORDER.length) * 100))}%`
            }}
          />
        </div>
        <p className="clinical-preparation-next muted" data-testid="clinical-preparation-next">
          Next: {state.nextStep}
        </p>
      </section>

      <section className="clinical-preparation-section">
        <h3>Workflow Timeline</h3>
        <ol className="clinical-preparation-timeline" data-testid="clinical-preparation-timeline">
          {PREPARATION_WORKFLOW_ORDER.filter((p) => p !== 'idle' && p !== 'cancelled').map(
            (phase) => (
              <li
                key={phase}
                className={
                  phase === state.workflowPhase
                    ? 'clinical-preparation-timeline__item clinical-preparation-timeline__item--active'
                    : 'clinical-preparation-timeline__item'
                }
              >
                {WORKFLOW_LABELS[phase]}
              </li>
            )
          )}
        </ol>
      </section>

      <section className="clinical-preparation-section">
        <h3>Stage</h3>
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
              {STAGE_LABELS[stage]}
            </span>
          ))}
        </div>
      </section>

      {state.validationReport !== undefined ? (
        <section className="clinical-preparation-section">
          <h3>Validation Report</h3>
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

      <section className="clinical-preparation-section">
        <h3>Current Tool</h3>
        <p data-testid="clinical-preparation-current-tool">
          {state.activeTool ?? state.selectedTool ?? 'None'}
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
      </section>

      <footer className="clinical-preparation-actions">
        <button type="button" className="clinical-preparation-btn" onClick={run(() => prep.start())}>
          Start
        </button>
        <button
          type="button"
          className="clinical-preparation-btn"
          onClick={run(() => prep.activateSession())}
        >
          Activate
        </button>
        <button type="button" className="clinical-preparation-btn" onClick={run(() => prep.validate())}>
          Validate
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
        <button
          type="button"
          className="clinical-preparation-btn clinical-preparation-btn--accept"
          onClick={run(() => prep.complete())}
        >
          Complete
        </button>
        <button
          type="button"
          className="clinical-preparation-btn clinical-preparation-btn--cancel"
          onClick={run(() => prep.cancel())}
        >
          Cancel
        </button>
      </footer>
    </div>
  );
};

export type { PreparationOrchestrationToolId };
