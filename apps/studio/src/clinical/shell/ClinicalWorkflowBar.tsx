import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  buildClinicalWorkflowPresentation,
  workflowStepBlockMessage,
  type ClinicalWorkflowStepId
} from './ClinicalWorkflowPresentation.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

const enterStep = (workspace: ClinicalWorkspace, id: ClinicalWorkflowStepId): void => {
  const host = workspace.getHost();
  const run = (commandId: string): void => {
    void host.commands.invoke(commandId);
  };

  switch (id) {
    case 'import':
      run('clinical.tool.import');
      return;
    case 'orient':
      run('clinical.tool.orient');
      return;
    case 'prepare':
      workspace.layout.update({ leftSection: 'preparation' });
      run('clinical.preparation.openPanel');
      return;
    case 'trim':
      run('clinical.tool.trim');
      return;
    case 'close-base':
      run('clinical.tool.closeBase');
      return;
    case 'segment':
    case 'identify':
      run('clinical.tool.segmentation');
      return;
    case 'analyze':
      run('clinical.tool.analysis');
      return;
    default:
      return;
  }
};

export const ClinicalWorkflowBar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const presentation = buildClinicalWorkflowPresentation(workspace);
  const visibleStepIds = new Set<ClinicalWorkflowStepId>([
    'import',
    'orient',
    'prepare',
    'trim',
    'close-base',
    'segment'
  ]);
  const visibleSteps = presentation.steps.filter((step) => visibleStepIds.has(step.id));

  return (
    <nav className="clinical-workflow-bar" aria-label="Clinical workflow" data-testid="clinical-workflow-bar">
      <ol className="clinical-workflow-bar__list">
        {visibleSteps.map((step, index) => {
          const interactive =
            step.status === 'completed' ||
            step.status === 'current' ||
            step.status === 'available';
          return (
            <li key={step.id} className="clinical-workflow-bar__item">
              {index > 0 ? <span className="clinical-workflow-bar__sep" aria-hidden="true" /> : null}
              <button
                type="button"
                className={`clinical-workflow-step clinical-workflow-step--${step.status}${
                  step.id === presentation.currentStepId ? ' clinical-workflow-step--focus' : ''
                }`}
                disabled={!interactive}
                title={step.hint}
                aria-current={step.id === presentation.currentStepId ? 'step' : undefined}
                data-testid={`clinical-workflow-step-${step.id}`}
                data-status={step.status}
                onClick={() => {
                  if (!interactive) {
                    session.getHost().notifications.push('info', 'Workflow', workflowStepBlockMessage(step));
                    return;
                  }
                  enterStep(workspace, step.id);
                  session.notifyUi();
                }}
              >
                <span className="clinical-workflow-step__marker" aria-hidden="true">
                  {step.status === 'completed' ? '✓' : String(index + 1)}
                </span>
                <span className="clinical-workflow-step__label">{step.shortLabel}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="clinical-workflow-bar__context" data-testid="clinical-workflow-context">
        <strong>{presentation.currentTitle}</strong>
        <span>{presentation.nextTitle}</span>
      </div>
    </nav>
  );
};
