import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import type { OrientationIncrement, OrientationMode } from '../orientation/ClinicalOrientationState.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

/**
 * Orientation toolbar — auto-orient + manual refine + accept/cancel.
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

  const run = (fn: () => { readonly ok: boolean; readonly error?: { readonly message: string } }): void => {
    const result = fn();
    if (!result.ok) {
      session.getHost().notifications.push(
        'warning',
        'Orientation',
        result.error?.message ?? 'Orientation failed'
      );
    }
    session.notifyUi();
  };

  const modes: Array<{ id: OrientationMode; label: string }> = [
    { id: 'free', label: 'Free' },
    { id: 'axis-x', label: 'X' },
    { id: 'axis-y', label: 'Y' },
    { id: 'axis-z', label: 'Z' },
    { id: 'incremental', label: 'Step' },
    { id: 'snap', label: 'Snap' }
  ];

  const increments: OrientationIncrement[] = [1, 5, 15];
  const doc = session.getPublicState().activeCase;
  const hasUpper = doc?.objects.some((o) => o.archRole === 'upper') === true;
  const hasLower = doc?.objects.some((o) => o.archRole === 'lower') === true;
  const confidence = state.confidence;
  const lowConfidence = confidence === 'low' || confidence === 'unavailable';
  const failed = confidence === 'unavailable';

  return (
    <div className="clinical-orientation-toolbar" data-testid="clinical-orientation-toolbar">
      <div className="clinical-orientation-toolbar__summary">
        <strong>Orient</strong>
        <span className="muted">
          {state.autoMessage ?? 'We positioned your scans for clinical review.'}
        </span>
        <span className="clinical-orientation-toolbar__arches muted">
          {hasUpper ? 'Upper Arch' : null}
          {hasUpper && hasLower ? ' · ' : null}
          {hasLower ? 'Lower Arch' : null}
          {!hasUpper && !hasLower ? 'Scan' : null}
          {confidence !== undefined ? ` · Confidence: ${confidence}` : null}
        </span>
      </div>

      <div className="clinical-orientation-toolbar__group">
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
          Re-run Auto Orient
        </button>
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className={
              state.mode === m.id
                ? 'clinical-orient-btn clinical-orient-btn--active'
                : 'clinical-orient-btn'
            }
            onClick={() => {
              if (m.id === 'snap') {
                run(() => workspace.orientation.snap());
              } else {
                run(() => workspace.orientation.setMode(m.id));
              }
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="clinical-orientation-toolbar__group">
        <span className="clinical-orientation-toolbar__label">Step°</span>
        {increments.map((deg) => (
          <button
            key={deg}
            type="button"
            className={
              state.incrementDegrees === deg
                ? 'clinical-orient-btn clinical-orient-btn--active'
                : 'clinical-orient-btn'
            }
            onClick={() => run(() => workspace.orientation.setIncrement(deg))}
          >
            {deg}°
          </button>
        ))}
        <button
          type="button"
          className="clinical-orient-btn"
          onClick={() => run(() => workspace.orientation.rotateIncremental(-1))}
        >
          −
        </button>
        <button
          type="button"
          className="clinical-orient-btn"
          onClick={() => run(() => workspace.orientation.rotateIncremental(1))}
        >
          +
        </button>
      </div>

      <div className="clinical-orientation-toolbar__group clinical-orientation-toolbar__actions">
        <button
          type="button"
          className="clinical-orient-btn"
          data-testid="clinical-orientation-reset"
          onClick={() => run(() => workspace.orientation.reset())}
        >
          Reset
        </button>
        <button
          type="button"
          className="clinical-orient-btn clinical-orient-btn--cancel"
          onClick={() => run(() => workspace.orientation.cancel())}
        >
          Cancel
        </button>
        {failed ? (
          <button
            type="button"
            className="clinical-orient-btn clinical-orient-btn--accept"
            data-testid="clinical-orientation-manual"
            onClick={() => {
              run(() => workspace.orientation.setMode('free'));
              session.getHost().notifications.push(
                'info',
                'Orientation',
                'Adjust manually, then Accept Orientation.'
              );
            }}
          >
            Orient Manually
          </button>
        ) : (
          <button
            type="button"
            className="clinical-orient-btn clinical-orient-btn--accept"
            data-testid="clinical-orientation-accept"
            onClick={() => {
              const result = workspace.orientation.accept();
              if (!result.ok) {
                session.getHost().notifications.push('warning', 'Orientation', result.error.message);
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
            {lowConfidence ? 'Review & Accept' : 'Accept Orientation'}
          </button>
        )}
      </div>

      <div className="clinical-orientation-toolbar__status muted" data-testid="clinical-orientation-status">
        {lowConfidence && !failed ? 'Orientation needs review.' : state.statusMessage}
      </div>
    </div>
  );
};
