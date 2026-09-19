/**
 * CLN-WORKSTATION-001 — compact clinical tool palette (left rail).
 * Progressive disclosure: only active tools look active. Future tools stay inert.
 */

import { useClinicalUiRevision } from './useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { buildClinicalWorkflowPresentation } from './ClinicalWorkflowPresentation.js';

export const ClinicalToolPalette = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const presentation = buildClinicalWorkflowPresentation(workspace);
  const host = session.getHost();

  const trimming = workspace.trim.isActive();
  const basing = workspace.closeBase.isActive();
  const segmenting = workspace.segmentation.isActive();
  const orienting = workspace.orientation.isActive();

  const activeId: PaletteToolId | 'orient' | undefined = trimming
    ? 'trim'
    : basing
      ? 'close-base'
      : segmenting
        ? 'segmentation'
        : orienting
          ? 'orient'
          : undefined;

  const invoke = (commandId: string): void => {
    void host.commands.invoke(commandId);
    session.notifyUi();
  };

  const canEdit =
    presentation.steps.find((s) => s.id === 'trim')?.status !== 'locked' ||
    trimming ||
    basing ||
    segmenting;

  const contextual = trimming
    ? [
        { id: 'lasso', label: 'Lasso', icon: '⌁', onClick: () => workspace.trim.setDrawMode('lasso') },
        { id: 'curve', label: 'Curve', icon: '⌒', onClick: () => workspace.trim.setDrawMode('curve') },
        { id: 'clear', label: 'Clear', icon: '×', onClick: () => workspace.trim.clearBoundary() },
        { id: 'undo', label: 'Undo', icon: '↶', onClick: () => workspace.trim.undo() }
      ]
    : basing
      ? [
          { id: 'upper', label: 'Upper', icon: 'U', onClick: () => workspace.closeBase.setActiveArch('upper') },
          { id: 'lower', label: 'Lower', icon: 'L', onClick: () => workspace.closeBase.setActiveArch('lower') },
          { id: 'create-base', label: 'Create', icon: '▱', onClick: () => void workspace.closeBase.autoCreateBase() }
        ]
      : segmenting
        ? [
            { id: 'mark-teeth', label: 'Mark', icon: '•', onClick: () => workspace.segmentation.setGuideStep('mark-teeth') },
            { id: 'auto-segmentation', label: 'Auto', icon: '✦', onClick: () => { workspace.segmentation.setGuideStep('auto-segmentation'); void workspace.segmentation.segmentTeeth(); } },
            { id: 'adjust-boundaries', label: 'Adjust', icon: '⌘', onClick: () => workspace.segmentation.setGuideStep('adjust-boundaries') },
            { id: 'verify-teeth', label: 'Verify', icon: '✓', onClick: () => workspace.segmentation.setGuideStep('verify-teeth') }
          ]
        : [];

  const runContextual = (action: { readonly onClick: () => unknown }): void => {
    void action.onClick();
    session.notifyUi();
  };

  return (
    <nav className="clinical-tool-palette" data-testid="clinical-tool-palette" aria-label="Clinical tools">
      {contextual.length > 0 ? contextual.map((action) => {
        return (
          <button
            key={action.id}
            type="button"
            className="clinical-tool-palette__btn clinical-tool-palette__btn--contextual"
            data-testid={`clinical-palette-${action.id}`}
            title={action.label}
            onClick={() => runContextual(action)}
          >
            <span className="clinical-tool-palette__icon" aria-hidden="true">
              {action.icon}
            </span>
            <span className="clinical-tool-palette__label">{action.label}</span>
          </button>
        );
      }) : (
        <>
          <button
            type="button"
            className={activeId === 'orient' ? 'clinical-tool-palette__btn clinical-tool-palette__btn--active' : 'clinical-tool-palette__btn'}
            data-testid="clinical-palette-orient"
            title="Orient Scan"
            onClick={() => invoke('clinical.tool.orient')}
          >
            <span className="clinical-tool-palette__icon" aria-hidden="true">⌖</span>
            <span className="clinical-tool-palette__label">Orient</span>
          </button>
          <button type="button" className="clinical-tool-palette__btn" data-testid="clinical-palette-trim" disabled={!canEdit} title="Trim" onClick={() => invoke('clinical.tool.trim')}>
            <span className="clinical-tool-palette__icon" aria-hidden="true">✂</span>
            <span className="clinical-tool-palette__label">Trim</span>
          </button>
          <button type="button" className="clinical-tool-palette__btn" data-testid="clinical-palette-close-base" disabled={!canEdit} title="Base" onClick={() => invoke('clinical.tool.closeBase')}>
            <span className="clinical-tool-palette__icon" aria-hidden="true">▢</span>
            <span className="clinical-tool-palette__label">Base</span>
          </button>
          <button type="button" className="clinical-tool-palette__btn" data-testid="clinical-palette-segmentation" disabled={!canEdit} title="Segment" onClick={() => invoke('clinical.tool.segmentation')}>
            <span className="clinical-tool-palette__icon" aria-hidden="true">⊞</span>
            <span className="clinical-tool-palette__label">Segment</span>
          </button>
        </>
      )}

      <div className="clinical-tool-palette__stage-note" aria-live="polite">
        {presentation.currentStepId === 'orient'
          ? 'Align'
          : presentation.currentStepId === 'trim'
            ? 'Edit'
            : presentation.currentStepId === 'close-base'
              ? 'Build'
              : presentation.currentStepId === 'segment' || presentation.currentStepId === 'identify'
                ? 'Review'
                : 'Workflow'}
      </div>
    </nav>
  );
};
