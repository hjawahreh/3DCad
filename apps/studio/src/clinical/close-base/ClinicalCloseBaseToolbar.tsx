import { useState, useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { ClinicalArchSwitcher } from '../shell/ClinicalArchSwitcher.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';

/**
 * CLN-WORKFLOW-002 — compact Base panel.
 * Create Base commits automatically (no separate Accept). Done → Segmentation.
 */
export const ClinicalCloseBaseToolbar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const closeBase = workspace.closeBase;
  const [baseCreated, setBaseCreated] = useState(false);
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

  const createAndCommit = async (): Promise<void> => {
    const committed = await closeBase.autoCreateBase();
    if (!committed.ok) {
      session.getHost().notifications.push(
        'warning',
        'Base',
        'Unable to create the clinical base. The scan boundary needs review.'
      );
      return;
    }
    setBaseCreated(true);
    session.getHost().notifications.push('success', 'Base', 'Base created');
    // Fit active arch after result
    workspace.viewport.fitAll();
    workspace.viewport.presentClinicalAnteriorView({ preferClinicalFrame: true });
  };

  const finishBaseStage = async (): Promise<void> => {
    // Create Base already commits. Done must NOT re-run accept()/geometry —
    // that blocked the Base→Segment transition for minutes on real scans.
    if (hasUpper && hasLower && activeArch === 'upper' && !closeBase.hasCommittedArch('lower')) {
      const switched = closeBase.setActiveArch('lower');
      if (!switched.ok) {
        session.getHost().notifications.push('warning', 'Base', switched.error.message);
        return;
      }
      workspace.archContext.setMode('lower');
      workspace.viewport.presentClinicalAnteriorView({ preferClinicalFrame: true });
      session.getHost().notifications.push('info', 'Base', 'Lower arch — create the lower base, then Done.');
      return;
    }
    closeBase.cancel();
    const entered = workspace.segmentation.enter();
    if (!entered.ok) {
      session.getHost().notifications.push('warning', 'Segment', entered.error.message);
      return;
    }
    workspace.archContext.setMode('both');
    workspace.viewport.showAll();
    workspace.viewport.presentCanonicalClinicalView('front');
    session.getHost().notifications.push(
      'info',
      'Segment',
      'Mark teeth, then run Auto Segmentation.'
    );
  };

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
                setBaseCreated(false);
                closeBase.setActiveArch(mode);
                workspace.viewport.fitAll();
                workspace.viewport.presentClinicalAnteriorView({ preferClinicalFrame: true });
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
          onClick={() => runAsync(createAndCommit)}
        >
          Create Base
        </button>
        <button
          type="button"
          className="clinical-close-base-btn clinical-close-base-btn--done"
          data-testid="clinical-close-base-done"
          disabled={processing || !baseCreated}
          onClick={() => runAsync(finishBaseStage)}
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
