import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { CLOSE_BASE_STRATEGIES } from './ClinicalCloseBaseStrategy.js';

/**
 * Close Base toolbar — strategy, parameters, preview/commit controls.
 */
export const ClinicalCloseBaseToolbar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const closeBase = workspace.closeBase;
  const state = useSyncExternalStore(
    (cb) => closeBase.session.subscribe(cb),
    () => closeBase.session.getState(),
    () => closeBase.session.getState()
  );

  if (!closeBase.isActive()) {
    return null;
  }

  const run = (fn: () => void): void => {
    fn();
    session.notifyUi();
  };

  const runAsync = (fn: () => Promise<void>): void => {
    void fn().finally(() => session.notifyUi());
  };

  const params = state.parameters;
  const toolStatus = closeBase.getToolStatus();

  return (
    <div className="clinical-close-base-toolbar" data-testid="clinical-close-base-toolbar">
      <div className="clinical-close-base-toolbar__group">
        <span className="clinical-close-base-toolbar__label">Strategy</span>
        {CLOSE_BASE_STRATEGIES.map((strategy) => (
          <button
            key={strategy.id}
            type="button"
            className={
              params.strategy === strategy.id
                ? 'clinical-close-base-btn clinical-close-base-btn--active'
                : 'clinical-close-base-btn'
            }
            title={strategy.description}
            onClick={() =>
              run(() => {
                closeBase.setStrategy(strategy.id);
              })
            }
          >
            {strategy.title}
          </button>
        ))}
      </div>
      <div className="clinical-close-base-toolbar__group">
        <label className="clinical-close-base-field">
          Height
          <input
            type="number"
            min={0.5}
            max={20}
            step={0.5}
            value={params.height}
            onChange={(event) =>
              run(() => {
                closeBase.setParameters({ height: Number(event.target.value) });
              })
            }
          />
        </label>
        <label className="clinical-close-base-field">
          Thickness
          <input
            type="number"
            min={0.5}
            max={10}
            step={0.1}
            value={params.thickness}
            onChange={(event) =>
              run(() => {
                closeBase.setParameters({ thickness: Number(event.target.value) });
              })
            }
          />
        </label>
        <label className="clinical-close-base-field">
          Margin
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={params.margin}
            onChange={(event) =>
              run(() => {
                closeBase.setParameters({ margin: Number(event.target.value) });
              })
            }
          />
        </label>
        <button
          type="button"
          className="clinical-close-base-btn"
          onClick={() =>
            run(() => {
              closeBase.cycleOrientation();
            })
          }
        >
          Plane {params.orientation.toUpperCase()}
        </button>
        <button
          type="button"
          className={
            params.smoothing
              ? 'clinical-close-base-btn clinical-close-base-btn--active'
              : 'clinical-close-base-btn'
          }
          onClick={() =>
            run(() => {
              closeBase.toggleSmoothing();
            })
          }
        >
          Smooth
        </button>
      </div>
      <div className="clinical-close-base-toolbar__group clinical-close-base-toolbar__actions">
        <button
          type="button"
          className="clinical-close-base-btn clinical-close-base-btn--accept"
          onClick={() =>
            runAsync(async () => {
              const result = await closeBase.accept();
              if (!result.ok) {
                session.getHost().notifications.push('warning', 'Close Base', result.error.message);
              }
            })
          }
        >
          Accept Base
        </button>
        <button
          type="button"
          className="clinical-close-base-btn clinical-close-base-btn--cancel"
          onClick={() =>
            run(() => {
              closeBase.cancel();
            })
          }
        >
          Cancel
        </button>
        <button
          type="button"
          className="clinical-close-base-btn"
          onClick={() =>
            run(() => {
              closeBase.reset();
            })
          }
        >
          Reset
        </button>
        <button
          type="button"
          className="clinical-close-base-btn"
          onClick={() =>
            run(() => {
              closeBase.undo();
            })
          }
        >
          Undo
        </button>
        <button
          type="button"
          className="clinical-close-base-btn"
          onClick={() =>
            run(() => {
              closeBase.redo();
            })
          }
        >
          Redo
        </button>
      </div>
      <div className="clinical-close-base-toolbar__status muted" data-testid="clinical-close-base-status">
        {toolStatus} · {state.statusMessage}
      </div>
      {state.progressMessage !== undefined ? (
        <div className="clinical-close-base-toolbar__progress" data-testid="clinical-close-base-progress">
          {state.progressMessage} ({String(state.progressCompleted)}/{String(state.progressTotal)})
        </div>
      ) : null}
      {state.validationReport !== undefined && !state.validationReport.passed ? (
        <div className="clinical-close-base-toolbar__errors" data-testid="clinical-close-base-errors">
          {state.validationReport.checks
            .filter((c) => !c.passed)
            .map((c) => c.message)
            .join(' · ')}
        </div>
      ) : null}
    </div>
  );
};
