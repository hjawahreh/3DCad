import type { ClinicalLeftSection } from '../workspace/ClinicalLayout.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalPreparationPanel } from './ClinicalPreparationPanel.js';
import { useClinicalLayout } from './useClinicalLayout.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

const SECTIONS: readonly { readonly id: ClinicalLeftSection; readonly label: string; readonly enabled: boolean }[] =
  Object.freeze([
    Object.freeze({ id: 'case', label: 'Case', enabled: true }),
    Object.freeze({ id: 'scene', label: 'Scene', enabled: false }),
    Object.freeze({ id: 'objects', label: 'Objects', enabled: false }),
    Object.freeze({ id: 'preparation', label: 'Preparation', enabled: true }),
    Object.freeze({ id: 'segmentation', label: 'Segmentation', enabled: false }),
    Object.freeze({ id: 'treatment', label: 'Treatment', enabled: false }),
    Object.freeze({ id: 'manufacturing', label: 'Manufacturing', enabled: false })
  ]);

export const ClinicalLeftPanel = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const layout = useClinicalLayout(workspace.layout);
  const doc = session.getPublicState().activeCase;
  const recent = session.getRecentCases().list();
  const section = layout.leftSection;

  return (
    <div className="clinical-left">
      <div className="clinical-left__nav">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              section === item.id
                ? 'clinical-left__nav-item clinical-left__nav-item--active'
                : 'clinical-left__nav-item'
            }
            disabled={!item.enabled}
            title={item.enabled ? item.label : `${item.label} — reserved`}
            onClick={() => workspace.layout.update({ leftSection: item.id })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="clinical-left__body">
        {section === 'preparation' ? (
          <ClinicalPreparationPanel workspace={workspace} />
        ) : (
          <>
            <h2>Case</h2>
            {doc === undefined ? (
              <p className="muted">No active case. Use Case → New Case to begin.</p>
            ) : (
              <dl className="kv">
                <dt>Name</dt>
                <dd>{doc.caseMeta.name}</dd>
                <dt>Patient</dt>
                <dd>{doc.patient.displayName}</dd>
                <dt>Revision</dt>
                <dd>{String(doc.revision)}</dd>
                <dt>Units</dt>
                <dd>{doc.units}</dd>
                <dt>Coordinates</dt>
                <dd>{doc.coordinateSystem}</dd>
              </dl>
            )}
            <h3>Objects</h3>
            <ul className="clinical-list">
              {doc === undefined || doc.objects.length === 0 ? (
                <li className="muted">No models loaded — use Import</li>
              ) : (
                doc.objects.map((obj) => (
                  <li key={obj.id}>
                    <strong>{obj.displayName}</strong>
                    <span className="muted">
                      {' '}
                      · {obj.format.toUpperCase()}
                      {obj.visible ? '' : ' · hidden'}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <h3>Recent</h3>
            <ul className="clinical-list">
              {recent.length === 0 ? <li className="muted">No recent cases</li> : null}
              {recent.map((entry) => (
                <li key={String(entry.caseId)}>
                  <strong>{entry.name}</strong>
                  <span className="muted"> · {entry.patientName}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
