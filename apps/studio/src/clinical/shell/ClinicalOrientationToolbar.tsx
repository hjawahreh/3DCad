import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import type { OrientationIncrement, OrientationMode } from '../orientation/ClinicalOrientationState.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

/**
 * Orientation toolbar — modes, increments, accept/cancel.
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

  return (
    <div className="clinical-orientation-toolbar" data-testid="clinical-orientation-toolbar">
      <div className="clinical-orientation-toolbar__group">
        <span className="clinical-orientation-toolbar__label">Rotate</span>
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
        <label className="clinical-orient-numeric">
          <span>Δ°</span>
          <input
            type="number"
            step="1"
            defaultValue={state.incrementDegrees}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const value = Number((e.target as HTMLInputElement).value);
              if (!Number.isFinite(value)) return;
              run(() => workspace.orientation.rotateBy(value));
            }}
          />
        </label>
      </div>

      <div className="clinical-orientation-toolbar__group clinical-orientation-toolbar__actions">
        <button
          type="button"
          className="clinical-orient-btn"
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
        <button
          type="button"
          className="clinical-orient-btn clinical-orient-btn--accept"
          onClick={() => run(() => workspace.orientation.accept())}
        >
          Accept
        </button>
      </div>

      <div className="clinical-orientation-toolbar__status muted">{state.statusMessage}</div>
    </div>
  );
};
