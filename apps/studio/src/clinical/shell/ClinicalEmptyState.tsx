import { useEffect, useState } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import type { RecentCaseEntry } from '../case/RecentCases.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

/**
 * Empty / no-scan viewport callout — Create / Open Case entry.
 */
export const ClinicalEmptyState = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const doc = session.getPublicState().activeCase;
  const hasModels = doc !== undefined && doc.objects.length > 0;
  const [recent, setRecent] = useState<readonly RecentCaseEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const listed = await workspace.cases.listCases();
        const fallback = session.getRecentCases().list();
        if (!cancelled) {
          setRecent(listed.length > 0 ? listed.slice(0, 5) : fallback.slice(0, 5));
        }
      } catch {
        if (!cancelled) setRecent(session.getRecentCases().list().slice(0, 5));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspace, session, doc?.caseId]);

  if (hasModels) {
    return null;
  }

  const run = (id: string): void => {
    void session.getHost().commands.invoke(id);
    session.notifyUi();
  };

  return (
    <div className="clinical-empty-state" data-testid="clinical-empty-state" role="region" aria-label="Start a case">
      <div className="clinical-empty-state__card">
        <p className="clinical-empty-state__eyebrow">CAD Studio · Clinical</p>
        <h2>{doc === undefined ? 'No cases yet' : 'No scan loaded'}</h2>
        <p className="clinical-empty-state__copy">
          {doc === undefined
            ? 'Create your first patient case to begin.'
            : 'Import Upper and Lower Arch scans to continue.'}
        </p>
        <div className="clinical-empty-state__actions">
          <button
            type="button"
            className="clinical-btn clinical-btn--primary"
            data-testid="clinical-empty-new-case"
            onClick={() => run('clinical.case.new')}
          >
            + New Case
          </button>
          <button
            type="button"
            className="clinical-btn clinical-btn--secondary"
            data-testid="clinical-empty-open"
            onClick={() => run('clinical.case.open')}
          >
            Open Case
          </button>
        </div>

        {recent.length > 0 ? (
          <div className="clinical-empty-state__recent" data-testid="clinical-empty-recent">
            <h3>Recent Cases</h3>
            <ul>
              {recent.map((entry) => (
                <li key={String(entry.caseId)}>
                  <button
                    type="button"
                    className="clinical-empty-state__recent-item"
                    onClick={() => {
                      void workspace.cases.openCase(workspace, entry.caseId).then((result) => {
                        if (!result.ok) {
                          session.getHost().notifications.push('error', 'Case', result.error.message);
                          return;
                        }
                        session.getHost().notifications.push(
                          'success',
                          'Case',
                          `Opened ${result.value.caseMeta.name}`
                        );
                        session.notifyUi();
                      });
                    }}
                  >
                    <strong>{entry.patientName}</strong>
                    <span>{entry.name}</span>
                    <span className="muted">{entry.workflowStatus ?? 'Saved case'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="clinical-empty-state__formats muted">Supported: STL · OBJ · PLY</p>
      </div>
    </div>
  );
};
