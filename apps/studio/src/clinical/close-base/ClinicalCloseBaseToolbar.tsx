import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { ClinicalArchSwitcher } from '../shell/ClinicalArchSwitcher.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';

/**
 * CLN-WORKSTATION-001 — compact Close Base / Extrude panel.
 * Primary: Create Base. One parameter: Height. Done exits (accepts preview when ready).
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
  const processing = state.toolStatus === 'processing' || Boolean(state.progressMessage);
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
      className="clinical-close-base-toolbar clinical-close-base-toolbar--workstation"
      data-testid="clinical-close-base-toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="clinical-close-base-toolbar__group">
        <span className="clinical-close-base-toolbar__label">Base</span>
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
        <label className="clinical-close-base-field clinical-close-base-field--slider">
          Height
          <input
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={params.height}
            data-testid="clinical-close-base-height"
            disabled={processing}
            onChange={(event) =>
              run(() => {
                closeBase.setParameters({ height: Number(event.target.value) });
              })
            }
          />
          <span className="clinical-close-base-field__value">{String(params.height)} mm</span>
        </label>
      </div>

      <div className="clinical-close-base-toolbar__group clinical-close-base-toolbar__actions">
        <button
          type="button"
          className="clinical-close-base-btn clinical-close-base-btn--primary"
          data-testid="clinical-close-base-auto"
          disabled={processing}
          onClick={() =>
            runAsync(async () => {
              const result = await closeBase.autoCloseBase();
              if (!result.ok) {
                session.getHost().notifications.push('warning', 'Base', result.error.message);
              }
            })
          }
        >
          Create Base
        </button>
        {state.previewActive ? (
          <button
            type="button"
            className="clinical-close-base-btn clinical-close-base-btn--accept"
            data-testid="clinical-close-base-accept"
            disabled={processing}
            onClick={() =>
              runAsync(async () => {
                const result = await closeBase.accept();
                if (!result.ok) {
                  session.getHost().notifications.push('warning', 'Base', result.error.message);
                } else {
                  session.getHost().notifications.push('success', 'Base', 'Base complete');
                }
              })
            }
          >
            Accept
          </button>
        ) : null}
        <button
          type="button"
          className="clinical-close-base-btn clinical-close-base-btn--done"
          data-testid="clinical-close-base-done"
          disabled={processing}
          onClick={() =>
            runAsync(async () => {
              if (state.previewActive) {
                const result = await closeBase.accept();
                if (!result.ok) {
                  session.getHost().notifications.push('warning', 'Base', result.error.message);
                  return;
                }
                session.getHost().notifications.push('success', 'Base', 'Base complete');
              }
              closeBase.cancel();
            })
          }
        >
          Done
        </button>
      </div>

      {processing ? (
        <div
          className="clinical-close-base-toolbar__progress"
          data-testid="clinical-close-base-progress"
        >
          CREATING BASE…
        </div>
      ) : (
        <div className="clinical-close-base-toolbar__status muted" data-testid="clinical-close-base-status">
          {state.statusMessage}
        </div>
      )}

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
