import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalPreparationPanel } from './ClinicalPreparationPanel.js';
import { ClinicalWorkflowGuide } from './ClinicalWorkflowGuide.js';
import { useClinicalUiRevision } from './useClinicalUi.js';
import { useSyncExternalStore } from 'react';
import {
  deriveTrimInteractionState,
  trimGuidedMessage
} from '../trim/ClinicalTrimInteractionState.js';

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
  const trimState = useSyncExternalStore(
    (cb) => workspace.trim.session.subscribe(cb),
    () => workspace.trim.session.getState(),
    () => workspace.trim.session.getState()
  );
  const trimming = workspace.trim.isActive();
  const trimInteraction = deriveTrimInteractionState({
    state: trimState,
    previewReady: workspace.trim.controller.isPreviewReady(),
    pointerDrawing: workspace.trim.controller.isPointerCaptured()
  });
  const trimGuide = trimming
    ? trimGuidedMessage(trimInteraction, trimState.drawMode)
    : undefined;

  return (
    <div className="clinical-left" data-testid="clinical-left-panel">
      <div className="clinical-left__body">
        <ClinicalWorkflowGuide workspace={workspace} />

        {trimGuide !== undefined ? (
          <section
            className="clinical-left__section clinical-left__trim-guide"
            aria-label="Trim guidance"
            data-testid="clinical-trim-left-guide"
          >
            <h3>Trim</h3>
            <p className="clinical-left__trim-guide-text">{trimGuide}</p>
          </section>
        ) : null}

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
            <ul className="clinical-list clinical-recent-list">
              {recent.map((entry) => (
                <li key={String(entry.caseId)}>
                  <button
                    type="button"
                    className="clinical-recent-list__item"
                    data-testid="clinical-recent-item"
                    onClick={() => {
                      void workspace.cases.openCase(workspace, entry.caseId).then((result) => {
                        if (!result.ok) {
                          host.notifications.push('error', 'Case', result.error.message);
                          return;
                        }
                        host.notifications.push(
                          'success',
                          'Case',
                          `Opened ${result.value.caseMeta.name}`
                        );
                        session.notifyUi();
                      });
                    }}
                  >
                    <strong>{entry.name}</strong>
                    <span className="muted"> · {entry.patientName}</span>
                    {entry.workflowStatus !== undefined ? (
                      <span className="clinical-recent-list__status muted">{entry.workflowStatus}</span>
                    ) : null}
                  </button>
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
