import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { buildClinicalWorkflowPresentation } from './ClinicalWorkflowPresentation.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

export const ClinicalStatusBar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const presentation = buildClinicalWorkflowPresentation(workspace);
  const activeTool = presentation.activeToolLabel;

  return (
    <footer className="clinical-status" data-testid="clinical-status-bar" role="status">
      <span className="clinical-status__message" data-testid="clinical-status-message">
        {presentation.statusLine}
      </span>
      {activeTool !== undefined ? (
        <span className="clinical-status__meta">Tool: {activeTool}</span>
      ) : null}
      <span className="clinical-status__meta">
        Step: {presentation.steps.find((s) => s.id === presentation.currentStepId)?.label ?? '—'}
      </span>
      <span className="status-bar__spacer" />
      <button
        type="button"
        className="clinical-status__diag"
        title="Open diagnostics"
        onClick={() => {
          void session.getHost().commands.invoke('clinical.diagnostics');
        }}
      >
        Diagnostics
      </button>
    </footer>
  );
};
