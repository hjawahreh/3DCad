import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';

/**
 * Trim toolbar — draw modes, boundary controls, accept/cancel.
 */
export const ClinicalTrimToolbar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const trim = workspace.trim;
  const state = useSyncExternalStore(
    (cb) => trim.session.subscribe(cb),
    () => trim.session.getState(),
    () => trim.session.getState()
  );

  if (!trim.isActive()) {
    return null;
  }

  const run = (fn: () => void): void => {
    fn();
    session.notifyUi();
  };

  const runAsync = (fn: () => Promise<void>): void => {
    void fn().finally(() => session.notifyUi());
  };

  return (
    <div className="clinical-trim-toolbar" data-testid="clinical-trim-toolbar">
      <div className="clinical-trim-toolbar__group">
        <span className="clinical-trim-toolbar__label">Draw</span>
        <button
          type="button"
          className={
            state.drawMode === 'polyline'
              ? 'clinical-trim-btn clinical-trim-btn--active'
              : 'clinical-trim-btn'
          }
          onClick={() => run(() => {
            trim.setDrawMode('polyline');
          })}
        >
          Polyline
        </button>
        <button
          type="button"
          className={
            state.drawMode === 'freehand'
              ? 'clinical-trim-btn clinical-trim-btn--active'
              : 'clinical-trim-btn'
          }
          onClick={() => run(() => {
            trim.setDrawMode('freehand');
          })}
        >
          Freehand
        </button>
      </div>
      <div className="clinical-trim-toolbar__group">
        <button type="button" className="clinical-trim-btn" onClick={() => run(() => { trim.undoPoint(); })}>
          Undo Pt
        </button>
        <button type="button" className="clinical-trim-btn" onClick={() => run(() => { trim.clearBoundary(); })}>
          Clear
        </button>
        <button type="button" className="clinical-trim-btn" onClick={() => run(() => { trim.closeBoundary(); })}>
          Close
        </button>
        <button type="button" className="clinical-trim-btn" onClick={() => run(() => { trim.validate(); })}>
          Validate
        </button>
      </div>
      <div className="clinical-trim-toolbar__group clinical-trim-toolbar__actions">
        <button
          type="button"
          className="clinical-trim-btn clinical-trim-btn--accept"
          onClick={() => runAsync(async () => {
            const result = await trim.accept();
            if (!result.ok) {
              session.getHost().notifications.push('warning', 'Trim', result.error.message);
            }
          })}
        >
          Accept
        </button>
        <button
          type="button"
          className="clinical-trim-btn clinical-trim-btn--cancel"
          onClick={() => run(() => { trim.cancel(); })}
        >
          Cancel
        </button>
        <button type="button" className="clinical-trim-btn" onClick={() => run(() => trim.cancel())}>
          Reset
        </button>
      </div>
      <div className="clinical-trim-toolbar__status muted">{state.statusMessage}</div>
      {state.validationReport !== undefined ? (
        <div className="clinical-trim-toolbar__stats" data-testid="clinical-trim-stats">
          Points: {String(state.points.length)} · Closed: {state.closed ? 'yes' : 'no'}
        </div>
      ) : (
        <div className="clinical-trim-toolbar__stats" data-testid="clinical-trim-stats">
          Points: {String(state.points.length)}
        </div>
      )}
    </div>
  );
};
