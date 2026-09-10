/**
 * Analysis overlay — lightweight measurement/annotation HUD.
 */

import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { summarizeValidation } from './ClinicalAnalysisValidation.js';

export const ClinicalAnalysisOverlay = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const analysis = workspace.analysis;
  const state = useSyncExternalStore(
    (cb) => analysis.session.subscribe(cb),
    () => analysis.session.getState(),
    () => analysis.session.getState()
  );

  if (!analysis.isActive()) {
    return null;
  }

  const result = state.lastResult;
  const teeth = state.toothSnapshot ?? [];

  return (
    <div className="clinical-analysis-overlay" data-testid="clinical-analysis-overlay">
      <div className="clinical-analysis-overlay__panel">
        <strong>Analysis</strong>
        <span>{state.statusMessage}</span>
        {state.mode === 'distance' ? (
          <span>Select two points to measure distance.</span>
        ) : null}
        {state.picks.length > 0 ? (
          <span>
            Points {String(state.picks.length)}
            {state.picks.map((p, i) => (
              <span key={String(i)} className="clinical-analysis-overlay__pick">
                · P{String(i + 1)} ({p.point.x.toFixed(1)}, {p.point.y.toFixed(1)},{' '}
                {p.point.z.toFixed(1)})
              </span>
            ))}
          </span>
        ) : null}
        {result !== undefined ? (
          <>
            <span data-testid="clinical-analysis-overlay-value">
              {result.measurements[0]?.value.display ?? '—'}
            </span>
            <span className="muted">{summarizeValidation(result)}</span>
          </>
        ) : null}
        {teeth.length > 0 ? (
          <ul className="clinical-analysis-tooth-list" data-testid="clinical-analysis-tooth-list">
            {teeth.slice(0, 16).map((t) => {
              const fdi = t.identification.fdi;
              const label = fdi !== undefined ? String(fdi) : t.instanceId;
              const needs =
                t.identification.status === 'UNCERTAIN' ||
                t.identification.status === 'UNKNOWN';
              return (
                <li key={t.instanceId}>
                  <button
                    type="button"
                    className={
                      state.selectedInstanceId === t.instanceId
                        ? 'clinical-link clinical-link--active'
                        : 'clinical-link'
                    }
                    onClick={() => {
                      analysis.selectInstance(t.instanceId);
                      void analysis.analyzeTooth(t.instanceId);
                      session.notifyUi();
                    }}
                  >
                    {needs ? '! ' : '✓ '}
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="muted">No tooth instances — measure points or run segmentation first.</span>
        )}
      </div>
      {state.picks.length >= 2 ? (
        <svg className="clinical-analysis-overlay__svg" aria-hidden="true">
          <line
            x1="20%"
            y1="40%"
            x2="80%"
            y2="60%"
            className="clinical-analysis-measure-line"
          />
          <circle cx="20%" cy="40%" r="4" className="clinical-analysis-measure-endpoint" />
          <circle cx="80%" cy="60%" r="4" className="clinical-analysis-measure-endpoint" />
        </svg>
      ) : null}
    </div>
  );
};
