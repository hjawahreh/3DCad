import { useSyncExternalStore } from 'react';
import { screenDeltaToOrbitRadians } from '../../application/camera-orbit-mapping.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

/**
 * CLN-WORKSTATION-001 — compact Orient Scan toolbar.
 * Auto-orient is default; manual controls are direct camera nudges (no XYZ editing).
 */
export const ClinicalOrientationToolbar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const state = useSyncExternalStore(
    (cb) => workspace.orientation.session.subscribe(cb),
    () => workspace.orientation.session.getState(),
    () => workspace.orientation.session.getState()
  );

  if (!workspace.orientation.isActive()) {
    return null;
  }

  const confidence = state.confidence;
  const lowConfidence = confidence === 'low' || confidence === 'unavailable';
  const failed = confidence === 'unavailable';

  const nudgeCamera = (dx: number, dy: number): void => {
    const camera = session.getHost().sessions.cameraSession;
    if (camera === undefined) return;
    const orbit = screenDeltaToOrbitRadians(dx, dy);
    camera.orbit(orbit.yaw, orbit.pitch);
    session.getHost().sessions.viewportSession?.invalidate('camera');
    session.notifyUi();
  };

  const STEP_PX = 48;

  return (
    <div
      className="clinical-orientation-toolbar clinical-orientation-toolbar--workstation"
      data-testid="clinical-orientation-toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="clinical-orientation-toolbar__group">
        <span className="clinical-orientation-toolbar__label">Orient Scan</span>
        <button
          type="button"
          className="clinical-orient-btn"
          data-testid="clinical-orientation-rotate-left"
          title="Rotate left"
          onClick={() => nudgeCamera(-STEP_PX, 0)}
        >
          ←
        </button>
        <button
          type="button"
          className="clinical-orient-btn"
          data-testid="clinical-orientation-rotate-right"
          title="Rotate right"
          onClick={() => nudgeCamera(STEP_PX, 0)}
        >
          →
        </button>
        <button
          type="button"
          className="clinical-orient-btn"
          data-testid="clinical-orientation-rotate-up"
          title="Rotate up"
          onClick={() => nudgeCamera(0, -STEP_PX)}
        >
          ↑
        </button>
        <button
          type="button"
          className="clinical-orient-btn"
          data-testid="clinical-orientation-rotate-down"
          title="Rotate down"
          onClick={() => nudgeCamera(0, STEP_PX)}
        >
          ↓
        </button>
        <button
          type="button"
          className="clinical-orient-btn"
          data-testid="clinical-orientation-home"
          title="Home — clinical anterior"
          onClick={() => {
            workspace.viewport.presentCanonicalClinicalView('front');
            session.notifyUi();
          }}
        >
          Home
        </button>
        <button
          type="button"
          className="clinical-orient-btn"
          data-testid="clinical-orientation-reset"
          onClick={() => {
            const result = workspace.orientation.reset();
            if (!result.ok) {
              session.getHost().notifications.push('warning', 'Orientation', result.error.message);
            }
            session.notifyUi();
          }}
        >
          Reset
        </button>
      </div>

      <div className="clinical-orientation-toolbar__group clinical-orientation-toolbar__actions">
        <button
          type="button"
          className="clinical-orient-btn clinical-orient-btn--auto"
          data-testid="clinical-orientation-auto"
          onClick={() => {
            const result = workspace.orientation.autoOrient({ force: true });
            if (!result.ok) {
              session.getHost().notifications.push('warning', 'Orientation', result.error.message);
            }
            session.notifyUi();
          }}
        >
          Auto Orient
        </button>
        <button
          type="button"
          className="clinical-orient-btn clinical-orient-btn--cancel"
          onClick={() => {
            workspace.orientation.cancel();
            session.notifyUi();
          }}
        >
          Cancel
        </button>
        {failed ? (
          <button
            type="button"
            className="clinical-orient-btn clinical-orient-btn--accept"
            data-testid="clinical-orientation-manual"
            onClick={() => {
              workspace.orientation.setMode('free');
              session
                .getHost()
                .notifications.push('info', 'Orientation', 'Adjust with arrows, then Accept.');
              session.notifyUi();
            }}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="clinical-orient-btn clinical-orient-btn--accept"
            data-testid="clinical-orientation-accept"
            onClick={() => {
              const result = workspace.orientation.accept();
              if (!result.ok) {
                session
                  .getHost()
                  .notifications.push('warning', 'Orientation', result.error.message);
                session.notifyUi();
                return;
              }
              workspace.preparation.notifyOrientationComplete();
              const prep = workspace.preparation.autoPrepare();
              if (!prep.ok) {
                session.getHost().notifications.push('warning', 'Prepare', prep.error.message);
              } else {
                session.getHost().notifications.push(
                  prep.value.uiState === 'warning' ? 'warning' : 'success',
                  'Preparation',
                  prep.value.message
                );
              }
              session.notifyUi();
            }}
          >
            {lowConfidence ? 'Review & Accept' : 'Accept'}
          </button>
        )}
      </div>

      <div className="clinical-orientation-toolbar__status muted" data-testid="clinical-orientation-status">
        {state.autoMessage ?? state.statusMessage}
      </div>
    </div>
  );
};
