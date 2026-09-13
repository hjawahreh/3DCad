import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { ClinicalArchSwitcher } from '../shell/ClinicalArchSwitcher.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { CLOSE_BASE_STRATEGIES } from './ClinicalCloseBaseStrategy.js';

/**
 * Close Base toolbar — arch, base style, clinical parameters, preview/commit.
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
  const doc = session.getPublicState().activeCase;
  const targetObj = doc?.objects.find((o) => o.id === state.targetObjectId);
  const activeArch =
    targetObj?.archRole === 'upper' || targetObj?.archRole === 'lower'
      ? targetObj.archRole
      : undefined;
  const hasUpper = doc?.objects.some((o) => o.archRole === 'upper') === true;
  const hasLower = doc?.objects.some((o) => o.archRole === 'lower') === true;

  return (
    <div
      className="clinical-close-base-toolbar"
      data-testid="clinical-close-base-toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="clinical-close-base-toolbar__group">
        <span className="clinical-close-base-toolbar__label">Arch</span>
        <ClinicalArchSwitcher
          active={activeArch}
          hasUpper={hasUpper}
          hasLower={hasLower}
          testId="clinical-close-base-arch"
          showBoth={false}
          onSelect={(mode) =>
            run(() => {
              if (mode === 'upper' || mode === 'lower') {
                closeBase.setActiveArch(mode);
              }
            })
          }
        />
      </div>
      <div className="clinical-close-base-toolbar__group">
        <span className="clinical-close-base-toolbar__label">Base Style</span>
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
            data-testid={`clinical-close-base-style-${strategy.id}`}
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
            data-testid="clinical-close-base-height"
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
            data-testid="clinical-close-base-thickness"
            onChange={(event) =>
              run(() => {
                closeBase.setParameters({ thickness: Number(event.target.value) });
              })
            }
          />
        </label>
        <label className="clinical-close-base-field">
          Offset
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={params.margin}
            data-testid="clinical-close-base-offset"
            onChange={(event) =>
              run(() => {
                closeBase.setParameters({ offset: Number(event.target.value) });
              })
            }
          />
        </label>
        <button
          type="button"
          className="clinical-close-base-btn"
          title="Base plane orientation"
          onClick={() =>
            run(() => {
              closeBase.cycleOrientation();
            })
          }
        >
          Plane {params.orientation.toUpperCase()}
        </button>
      </div>
      <div className="clinical-close-base-toolbar__group clinical-close-base-toolbar__actions">
        <button
          type="button"
          className="clinical-close-base-btn"
          data-testid="clinical-close-base-auto"
          onClick={() =>
            runAsync(async () => {
              const result = await closeBase.autoCloseBase();
              if (!result.ok) {
                session.getHost().notifications.push('warning', 'Close Base', result.error.message);
              }
            })
          }
        >
          Auto Create Base
        </button>
        <button
          type="button"
          className="clinical-close-base-btn"
          data-testid="clinical-close-base-manual"
          onClick={() =>
            run(() => {
              closeBase.enterManualMode();
            })
          }
        >
          Adjust Manually
        </button>
        <button
          type="button"
          className="clinical-close-base-btn"
          data-testid="clinical-close-base-preview"
          onClick={() =>
            runAsync(async () => {
              const result = await closeBase.preview();
              if (!result.ok) {
                session.getHost().notifications.push('warning', 'Close Base', result.error.message);
              }
            })
          }
        >
          Preview
        </button>
        <button
          type="button"
          className="clinical-close-base-btn clinical-close-base-btn--accept"
          data-testid="clinical-close-base-accept"
          onClick={() =>
            runAsync(async () => {
              const result = await closeBase.accept();
              if (!result.ok) {
                session.getHost().notifications.push('warning', 'Close Base', result.error.message);
              }
            })
          }
        >
          Accept
        </button>
        <button
          type="button"
          className="clinical-close-base-btn clinical-close-base-btn--cancel"
          data-testid="clinical-close-base-cancel"
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
          disabled={!closeBase.history.canUndo()}
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
          disabled={!closeBase.history.canRedo()}
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
        {state.kernelFingerprint !== undefined
          ? ` · ${state.kernelFingerprint.slice(0, 18)}…`
          : ''}
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
