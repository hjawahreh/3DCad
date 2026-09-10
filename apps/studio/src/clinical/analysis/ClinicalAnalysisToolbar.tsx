/**
 * Analysis toolbar — measure / tooth / arch actions.
 */

import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { summarizeValidation } from './ClinicalAnalysisValidation.js';

export const ClinicalAnalysisToolbar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const analysis = workspace.analysis;
  const active = analysis.isActive();
  const state = useSyncExternalStore(
    (cb) => analysis.session.subscribe(cb),
    () => analysis.session.getState(),
    () => analysis.session.getState()
  );

  if (!active) {
    return null;
  }

  const run = (fn: () => void): void => {
    fn();
    session.notifyUi();
  };

  const result = state.lastResult;

  return (
    <div className="clinical-analysis-toolbar" data-testid="clinical-analysis-toolbar" role="toolbar" aria-label="Analysis">
      <span className="clinical-analysis-toolbar__label">Analysis</span>
      <button
        type="button"
        className={
          state.mode === 'distance'
            ? 'clinical-btn clinical-btn--primary'
            : 'clinical-btn clinical-btn--secondary'
        }
        title="Measure distance between two points"
        onClick={() => run(() => analysis.setMode('distance'))}
      >
        Start Measurement
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        title="Measure 3D angle"
        onClick={() => run(() => analysis.setMode('angle'))}
      >
        Angle
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        title="Analyze selected or first tooth"
        onClick={() => run(() => { void analysis.analyzeTooth(state.selectedInstanceId); })}
      >
        Tooth
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        title="Fit arch curve to identified teeth"
        onClick={() => run(() => { void analysis.analyzeArch(); })}
      >
        Arch
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        onClick={() => run(() => { void analysis.analyzeSpacing(); })}
      >
        Spacing
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        onClick={() => run(() => { void analysis.analyzeCrowding(); })}
      >
        Crowding
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--tertiary"
        onClick={() => run(() => analysis.clearMeasurement())}
      >
        Clear
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        disabled={result === undefined}
        onClick={() => run(() => { void analysis.saveResult(); })}
      >
        Save Result
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--secondary"
        onClick={() => run(() => { void analysis.cancel(); })}
      >
        Done
      </button>
      {result !== undefined ? (
        <span className="clinical-analysis-toolbar__result" data-testid="clinical-analysis-result">
          {result.measurements[0]?.value.display ?? summarizeValidation(result)}
          {' · '}
          {result.validity}
        </span>
      ) : (
        <span className="clinical-analysis-toolbar__hint muted">{state.statusMessage}</span>
      )}
    </div>
  );
};
