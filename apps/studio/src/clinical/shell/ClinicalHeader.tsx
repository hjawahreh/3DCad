import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
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
  const state = session.getPublicState();
  const caseName = state.activeCase?.caseMeta.name ?? 'No Case';
  const patient = state.activeCase?.patient.displayName ?? '—';
  const dirty = state.dirty;
  const canUndo = workspace.orientation.history.canUndo();
  const canRedo = workspace.orientation.history.canRedo();

  const run = (id: string): void => {
    void host.commands.invoke(id);
  };

  return (
    <header className="clinical-header">
      <div className="clinical-brand">
        <span className="clinical-brand__mark" aria-hidden="true" />
        <div>
          <div className="clinical-brand__name">CAD Studio Clinical</div>
          <div className="clinical-brand__sub">Orthodontic CAD</div>
        </div>
      </div>

      <nav className="clinical-header__actions" aria-label="Case actions">
        <button type="button" onClick={() => run('clinical.case.new')}>
          Case
        </button>
        <button type="button" onClick={() => run('clinical.case.open')}>
          Patient
        </button>
        <button type="button" onClick={() => run('project.new')}>
          Project
        </button>
        <button type="button" onClick={() => run('clinical.tool.import')}>
          Import
        </button>
        <button type="button" onClick={() => run('clinical.case.save')}>
          Save
        </button>
        <button
          type="button"
          disabled={!canUndo}
          title={canUndo ? 'Undo orientation' : 'Nothing to undo'}
          onClick={() => run('clinical.orientation.undo')}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!canRedo}
          title={canRedo ? 'Redo orientation' : 'Nothing to redo'}
          onClick={() => run('clinical.orientation.redo')}
        >
          Redo
        </button>
        <button type="button" onClick={() => run('app.settings')}>
          Preferences
        </button>
        <button type="button" onClick={() => run('app.about')}>
          Help
        </button>
      </nav>

      <div className="clinical-header__case">
        <span className={dirty ? 'dirty-dot dirty-dot--on' : 'dirty-dot'} />
        <div>
          <div className="clinical-header__case-name">{caseName}</div>
          <div className="clinical-header__patient">{patient}</div>
        </div>
      </div>

      <button type="button" className="clinical-header__palette" onClick={onTogglePalette}>
        Commands
      </button>
    </header>
  );
};
