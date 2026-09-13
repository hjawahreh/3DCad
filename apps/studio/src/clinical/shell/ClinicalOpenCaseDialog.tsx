import { useEffect, useState } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import type { RecentCaseEntry } from '../case/RecentCases.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

const formatWhen = (ms: number | undefined): string => {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return '—';
  }
};

/**
 * Open existing case — lists persisted cases with workflow status.
 */
export const ClinicalOpenCaseDialog = ({
  workspace,
  onClose
}: {
  readonly workspace: ClinicalWorkspace;
  readonly onClose: () => void;
}): React.JSX.Element => {
  useClinicalUiRevision(workspace.session);
  const [cases, setCases] = useState<readonly RecentCaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(undefined);
      try {
        const listed = await workspace.cases.listCases();
        // Prefer persisted list; fall back to recent index if empty.
        const recent = workspace.session.getRecentCases().list();
        const merged =
          listed.length > 0
            ? listed
            : recent.map((e) =>
                Object.freeze({
                  ...e,
                  workflowStatus: e.workflowStatus ?? 'Recently opened'
                })
              );
        if (!cancelled) setCases(merged);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load cases');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const open = async (entry: RecentCaseEntry): Promise<void> => {
    setOpeningId(entry.caseId as string);
    setError(undefined);
    const result = await workspace.cases.openCase(workspace, entry.caseId);
    setOpeningId(undefined);
    if (!result.ok) {
      setError(
        result.error.code === 'dirty'
          ? 'Save or close the current case before opening another.'
          : result.error.message
      );
      return;
    }
    workspace.session.getHost().notifications.push(
      'success',
      'Case',
      `Opened ${result.value.caseMeta.name}`
    );
    onClose();
  };

  return (
    <div className="clinical-open-case" data-testid="clinical-open-case-dialog">
      <p className="clinical-import-dialog__intro">Open a previously created case.</p>

      {loading ? (
        <div className="clinical-open-case__loading" data-testid="clinical-open-loading">
          <p>Opening case list…</p>
          <p className="muted">Loading patient data</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="clinical-open-case__empty" data-testid="clinical-open-empty">
          <h3>No cases yet</h3>
          <p className="muted">Create your first patient case to begin.</p>
          <button
            type="button"
            className="clinical-btn clinical-btn--primary"
            onClick={() => {
              onClose();
              workspace.getHost().dialogs.open('new-case', 'Create Case');
            }}
          >
            Create New Case
          </button>
        </div>
      ) : (
        <ul className="clinical-case-list" data-testid="clinical-case-list">
          {cases.map((entry) => {
            const busy = openingId === (entry.caseId as string);
            return (
              <li key={String(entry.caseId)}>
                <button
                  type="button"
                  className="clinical-case-card"
                  data-testid="clinical-case-card"
                  disabled={openingId !== undefined}
                  onClick={() => void open(entry)}
                >
                  <span className="clinical-case-card__patient">{entry.patientName}</span>
                  <span className="clinical-case-card__name">{entry.name}</span>
                  <span className="clinical-case-card__meta muted">
                    {entry.workflowStatus ?? 'Saved case'} ·{' '}
                    {formatWhen(entry.updatedAt ?? entry.lastOpenedAt)}
                  </span>
                  {busy ? <span className="clinical-case-card__busy">Opening…</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error !== undefined ? (
        <p className="clinical-import-dialog__error" data-testid="clinical-open-error">
          {error}
        </p>
      ) : null}

      <div className="overlay-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button type="button" disabled={openingId !== undefined} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};
