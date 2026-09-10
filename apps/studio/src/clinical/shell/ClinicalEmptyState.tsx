import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

/**
 * Empty / no-scan viewport callout — presentation only.
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
        <h2>{doc === undefined ? 'Start a Case' : 'No scan loaded'}</h2>
        <p className="clinical-empty-state__copy">
          {doc === undefined
            ? 'Bring in a dental scan to begin the clinical workflow.'
            : 'Import an STL, OBJ, or PLY scan to continue.'}
        </p>
        <div className="clinical-empty-state__actions">
          <button
            type="button"
            className="clinical-btn clinical-btn--primary"
            data-testid="clinical-empty-import"
            onClick={() => run('clinical.tool.import')}
          >
            Import Scan
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
        <p className="clinical-empty-state__formats muted">Supported: STL · OBJ · PLY</p>
      </div>
    </div>
  );
};
