import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalPreparationPanel } from './ClinicalPreparationPanel.js';
import { ClinicalWorkflowGuide } from './ClinicalWorkflowGuide.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

/**
 * Left workflow panel — guided current step; case objects; advanced preparation collapsed.
 */
export const ClinicalLeftPanel = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const doc = session.getPublicState().activeCase;
  const recent = session.getRecentCases().list();
  const host = session.getHost();
  const selected = new Set<string>(
    (host.sessions.selectionSession?.getSnapshot().ids ?? []).map((id) => id as string)
  );

  return (
    <div className="clinical-left" data-testid="clinical-left-panel">
      <div className="clinical-left__body">
        <ClinicalWorkflowGuide workspace={workspace} />

        <section className="clinical-left__section" aria-label="Case objects">
          <h3>Case</h3>
          <ul className="clinical-list clinical-object-tree" data-testid="clinical-object-tree">
            {doc === undefined ? (
              <li className="muted">No case loaded</li>
            ) : doc.objects.length === 0 ? (
              <li className="muted">No models — import a scan</li>
            ) : (
              <>
                <li className="clinical-object-tree__root">
                  <strong>{doc.caseMeta.name}</strong>
                </li>
                {doc.objects.map((obj) => {
                  const isActive = selected.has(obj.id as string);
                  return (
                    <li
                      key={obj.id}
                      className={
                        isActive
                          ? 'clinical-object-tree__item clinical-object-tree__item--active'
                          : 'clinical-object-tree__item'
                      }
                    >
                      <button
                        type="button"
                        className="clinical-object-tree__eye"
                        title={obj.visible ? 'Hide' : 'Show'}
                        aria-label={obj.visible ? `Hide ${obj.displayName}` : `Show ${obj.displayName}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (obj.visible) workspace.viewport.hide(obj.id);
                          else workspace.viewport.show(obj.id);
                          session.notifyUi();
                        }}
                      >
                        {obj.visible ? '◉' : '○'}
                      </button>
                      <button
                        type="button"
                        className="clinical-object-tree__select"
                        onClick={() => {
                          host.sessions.selectionSession?.select('replace', [obj.id as string]);
                          session.notifyUi();
                        }}
                      >
                        <strong>{obj.displayName}</strong>
                        <span className="muted">
                          {' '}
                          · {isActive ? '● Active' : obj.visible ? 'Visible' : 'Hidden'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </>
            )}
          </ul>
        </section>

        {recent.length > 0 ? (
          <section className="clinical-left__section" aria-label="Recent cases">
            <h3>Recent</h3>
            <ul className="clinical-list">
              {recent.map((entry) => (
                <li key={String(entry.caseId)}>
                  <strong>{entry.name}</strong>
                  <span className="muted"> · {entry.patientName}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <details className="clinical-advanced" data-testid="clinical-advanced-preparation">
          <summary>Advanced preparation</summary>
          <ClinicalPreparationPanel workspace={workspace} />
        </details>
      </div>
    </div>
  );
};
