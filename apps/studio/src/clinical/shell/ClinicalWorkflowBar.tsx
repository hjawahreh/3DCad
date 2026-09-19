import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  buildClinicalWorkflowPresentation,
  workflowStepBlockMessage,
  type ClinicalWorkflowStepId
} from './ClinicalWorkflowPresentation.js';
import { useClinicalUiRevision } from './useClinicalUi.js';
import { useSyncExternalStore } from 'react';

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
  const processActive = useSyncExternalStore(
    (onChange) => workspace.getHost().processFeedback.subscribe(onChange),
    () => workspace.getHost().processFeedback.getState().active,
    () => workspace.getHost().processFeedback.getState().active
  );
  const visibleStepIds = new Set<ClinicalWorkflowStepId>([
    'import',
    'orient',
    'trim',
    'close-base',
    'segment'
  ]);
  const visibleSteps = presentation.steps.filter((step) => visibleStepIds.has(step.id));
  const preparationReady = workspace.preparation.isReadyForGeometry();
  const displayCurrentStepId =
    presentation.currentStepId === 'prepare'
      ? preparationReady ? 'trim' : 'orient'
      : presentation.currentStepId;

  const currentIndex = visibleSteps.findIndex((step) => step.id === displayCurrentStepId);
  const previousStep = currentIndex > 0 ? visibleSteps[currentIndex - 1] : undefined;
  const currentStep = visibleSteps[currentIndex];
  const nextStep = currentIndex >= 0 ? visibleSteps[currentIndex + 1] : undefined;
  const currentComplete =
    currentStep?.status === 'completed' ||
    (presentation.currentStepId === 'import' && presentation.emptyWorkspace === false);

  const runNext = (): void => {
    if (processActive) return;
    if (presentation.currentStepId === 'orient' && workspace.orientation.isActive()) {
      void workspace.getHost().commands.invoke('clinical.orientation.accept');
      return;
    }
    if (presentation.currentStepId === 'import' && nextStep !== undefined) {
      enterStep(workspace, nextStep.id);
      session.notifyUi();
      return;
    }
    if (presentation.currentStepId === 'prepare') {
      if (preparationReady) {
        enterStep(workspace, 'trim');
        session.notifyUi();
      } else {
        void workspace.getHost().commands.invoke('clinical.preparation.start');
      }
      return;
    }
    if (nextStep !== undefined && nextStep.status !== 'locked') {
      enterStep(workspace, nextStep.id);
      session.notifyUi();
    }
  };

  const runPrevious = (): void => {
    if (processActive || previousStep === undefined) return;
    enterStep(workspace, previousStep.id);
    session.notifyUi();
  };

  return (
    <nav className="clinical-workflow-bar" aria-label="Clinical workflow" data-testid="clinical-workflow-bar">
      <button
        type="button"
        className="clinical-workflow-nav clinical-workflow-nav--previous"
        disabled={processActive || previousStep === undefined}
        data-testid="clinical-workflow-previous"
        onClick={runPrevious}
      >
        <span aria-hidden="true">←</span> Previous
      </button>
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
                  step.id === displayCurrentStepId ? ' clinical-workflow-step--focus' : ''
                }`}
                disabled={!interactive || step.id !== presentation.currentStepId}
                title={step.hint}
                aria-current={step.id === displayCurrentStepId ? 'step' : undefined}
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
                <span className="clinical-workflow-step__label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="clinical-workflow-nav clinical-workflow-nav--next"
        disabled={processActive || (!currentComplete && presentation.currentStepId !== 'orient' && presentation.currentStepId !== 'prepare') || nextStep === undefined}
        data-testid="clinical-workflow-next"
        onClick={runNext}
      >
        Next <span aria-hidden="true">→</span>
      </button>
      <div className="clinical-workflow-bar__context" data-testid="clinical-workflow-context">
        <strong>{presentation.currentTitle}</strong>
        <span>{presentation.nextTitle}</span>
      </div>
    </nav>
  );
};
