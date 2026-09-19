import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { buildClinicalWorkflowPresentation } from './ClinicalWorkflowPresentation.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

export interface ClinicalHeaderProps {
  readonly workspace: ClinicalWorkspace;
  readonly onTogglePalette: () => void;
}

export const ClinicalHeader = ({
  workspace,
  onTogglePalette
}: ClinicalHeaderProps): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const host = session.getHost();
  const presentation = buildClinicalWorkflowPresentation(workspace);
  const caseName = presentation.caseName ?? 'No case loaded';
  const patient = session.getPublicState().activeCase?.patient.displayName;
  const dirty = session.getPublicState().dirty;
  const canUndo = workspace.orientation.history.canUndo();
  const canRedo = workspace.orientation.history.canRedo();

  const run = (id: string): void => {
    void host.commands.invoke(id);
  };

  return (
    <header className="clinical-header" data-testid="clinical-header">
      <div className="clinical-brand">
        <span className="clinical-brand__mark" aria-hidden="true" />
        <div>
          <div className="clinical-brand__name">CAD Studio</div>
          <div className="clinical-brand__sub">Clinical</div>
        </div>
      </div>

      <div className="clinical-header__case" data-testid="clinical-header-case">
        <span
          className={dirty ? 'dirty-dot dirty-dot--on' : 'dirty-dot'}
          title={presentation.saveLabel}
          aria-label={presentation.saveLabel}
        />
        <div>
          <div className="clinical-header__case-name">Case: {caseName}</div>
          <div className="clinical-header__patient">
            {patient !== undefined && patient.length > 0 ? patient : '—'}
            {' · '}
            <span className={dirty ? 'clinical-save-state clinical-save-state--dirty' : 'clinical-save-state'}>
              {presentation.saveLabel}
            </span>
          </div>
        </div>
        <span className="clinical-header__stage" data-testid="clinical-header-stage">
          {presentation.currentTitle}
        </span>
      </div>

      <nav className="clinical-header__actions" aria-label="Application actions">
        <button type="button" title="Save case" onClick={() => run('clinical.case.save')}>
          Save
        </button>
        <button
          type="button"
          disabled={!canUndo}
          title={canUndo ? 'Undo (Ctrl+Z)' : 'Nothing to undo'}
          onClick={() => run('clinical.orientation.undo')}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!canRedo}
          title={canRedo ? 'Redo (Ctrl+Shift+Z)' : 'Nothing to redo'}
          onClick={() => run('clinical.orientation.redo')}
        >
          Redo
        </button>
        <button type="button" title="Preferences" onClick={() => run('app.settings')}>
          Preferences
        </button>
        <button type="button" title="Help" onClick={() => run('app.about')}>
          Help
        </button>
        <button
          type="button"
          title="Diagnostics"
          onClick={() => run('clinical.diagnostics')}
        >
          Diagnostics
        </button>
        <button
          type="button"
          className="clinical-header__palette"
          title="Command palette"
          onClick={onTogglePalette}
        >
          Commands
        </button>
      </nav>
    </header>
  );
};
