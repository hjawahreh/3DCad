import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { buildClinicalWorkflowPresentation } from './ClinicalWorkflowPresentation.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

export const ClinicalWorkflowGuide = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const presentation = buildClinicalWorkflowPresentation(workspace);
  const host = session.getHost();
  const stepIndex = presentation.steps.findIndex((s) => s.id === presentation.currentStepId);
  const activeCount = presentation.steps.filter(
    (s) => s.status !== 'locked' || s.id === presentation.currentStepId
  ).length;

  const invoke = (commandId: string | undefined): void => {
    if (commandId === undefined) return;
    void host.commands.invoke(commandId);
    session.notifyUi();
  };

  return (
    <div className="clinical-workflow-guide" data-testid="clinical-workflow-guide">
      <header className="clinical-workflow-guide__header">
        <p className="clinical-workflow-guide__eyebrow">
          {stepIndex >= 0 ? `${String(stepIndex + 1)} of ${String(Math.min(7, activeCount || 7))}` : 'Workflow'}
        </p>
        <h2 data-testid="clinical-workflow-current-title">{presentation.currentTitle}</h2>
        <p className="clinical-workflow-guide__desc">{presentation.currentDescription}</p>
      </header>

      <section className="clinical-workflow-guide__next" aria-label="Next step">
        <h3>Next</h3>
        <p>{presentation.nextTitle}</p>
      </section>

      {presentation.currentStepId === 'prepare' || presentation.currentStepId === 'orient' ? (
        <section className="clinical-workflow-guide__checklist" aria-label="Preparation checklist">
          <h3>Checklist</h3>
          <ul>
            {presentation.checklist.map((item) => (
              <li
                key={item.id}
                className={
                  item.done
                    ? 'clinical-workflow-check clinical-workflow-check--done'
                    : 'clinical-workflow-check'
                }
              >
                <span aria-hidden="true">{item.done ? '✓' : '○'}</span>
                {item.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="clinical-workflow-guide__actions">
        <button
          type="button"
          className="clinical-btn clinical-btn--primary"
          data-testid="clinical-workflow-primary"
          disabled={presentation.primaryAction.disabled === true}
          onClick={() => invoke(presentation.primaryAction.commandId)}
        >
          {presentation.primaryAction.label}
        </button>
        {presentation.secondaryActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="clinical-btn clinical-btn--secondary"
            disabled={action.disabled === true}
            onClick={() => invoke(action.commandId)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};
