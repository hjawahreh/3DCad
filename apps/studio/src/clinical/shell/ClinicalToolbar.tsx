import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from './useClinicalUi.js';
import {
  buildClinicalWorkflowPresentation,
  type ClinicalWorkflowStepId
} from './ClinicalWorkflowPresentation.js';

const TOOL_TO_STEP: Readonly<Record<string, ClinicalWorkflowStepId>> = Object.freeze({
  import: 'import',
  orient: 'orient',
  trim: 'trim',
  'close-base': 'close-base',
  segment: 'segment',
  measure: 'analyze',
  analyze: 'analyze',
  move: 'movement'
});

/**
 * Compact contextual tool strip — stage-aware; locked tools stay in the workflow bar.
 */
export const ClinicalToolbar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const presentation = buildClinicalWorkflowPresentation(workspace);
  const stepStatus = new Map(presentation.steps.map((s) => [s.id, s.status]));
  const mode =
    workspace.trim.isActive()
      ? 'trim'
      : workspace.closeBase.isActive()
        ? 'close-base'
        : workspace.segmentation.isActive()
          ? 'segment'
          : workspace.orientation.isActive()
            ? 'orient'
            : workspace.analysis.isActive()
              ? 'analyze'
              : 'normal';

  const tools = session
    .getTools()
    .list()
    .filter((tool) => {
      if (!tool.enabled) return false;
      // While a focused clinical tool is active, keep the toolbar minimal.
      if (mode === 'trim') return tool.icon === 'trim';
      if (mode === 'close-base') return tool.icon === 'close-base';
      if (mode === 'segment') return tool.icon === 'segment';
      if (mode === 'orient') return tool.icon === 'orient' || tool.icon === 'import';
      if (mode === 'analyze') return tool.icon === 'analyze' || tool.icon === 'measure';
      const stepId = TOOL_TO_STEP[tool.icon];
      if (stepId === undefined) return false;
      const status = stepStatus.get(stepId);
      return status === 'completed' || status === 'current' || status === 'available';
    });

  const activeId = session.getTools().getActive()?.id;

  return (
    <div
      className={`clinical-toolbar clinical-toolbar--mode-${mode}`}
      role="toolbar"
      aria-label="Clinical tools"
      data-testid="clinical-toolbar"
      data-mode={mode}
    >
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={
            activeId === tool.id ? 'clinical-tool clinical-tool--active' : 'clinical-tool'
          }
          title={tool.tooltip}
          aria-pressed={activeId === tool.id}
          onClick={() => {
            const result = session.activateTool(tool.id);
            if (!result.ok) {
              session.notifyUi();
              return;
            }
            if (tool.icon === 'import') {
              session.getHost().dialogs.open('import', 'Import Dental Scans');
            }
            if (tool.icon === 'orient') {
              const entered = workspace.orientation.enter();
              if (!entered.ok) {
                session.getHost().notifications.push(
                  'warning',
                  'Orientation',
                  entered.error.message
                );
              }
            }
            if (tool.icon === 'trim') {
              const entered = workspace.trim.enter();
              if (!entered.ok) {
                session.getHost().notifications.push('warning', 'Trim', entered.error.message);
              }
            }
            if (tool.icon === 'close-base') {
              const entered = workspace.closeBase.enter();
              if (!entered.ok) {
                session.getHost().notifications.push(
                  'warning',
                  'Close Base',
                  entered.error.message
                );
              }
            }
            if (tool.icon === 'segment') {
              const entered = workspace.segmentation.enter();
              if (!entered.ok) {
                session.getHost().notifications.push(
                  'warning',
                  'Segmentation',
                  entered.error.message
                );
              }
            }
            if (tool.icon === 'analyze' || tool.icon === 'measure') {
              const entered = workspace.analysis.enter();
              if (!entered.ok) {
                session.getHost().notifications.push(
                  'warning',
                  'Analysis',
                  entered.error.message
                );
              } else if (tool.icon === 'measure') {
                workspace.analysis.setMode('distance');
              }
            }
            session.notifyUi();
          }}
        >
          <span className={`clinical-tool__icon clinical-tool__icon--${tool.icon}`} />
          <span className="clinical-tool__label">{tool.title}</span>
        </button>
      ))}
    </div>
  );
};
