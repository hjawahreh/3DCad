/**
 * CLN-WORKSTATION / CLN-WORKFLOW-002 — compact Trim panel.
 * Plane | Lasso | Curve · Arch · Done. Release-to-trim handles the cut.
 */

import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { ClinicalArchSwitcher } from '../shell/ClinicalArchSwitcher.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  deriveTrimInteractionState,
  trimGuidedMessage
} from './ClinicalTrimInteractionState.js';
import type { TrimDrawMode } from './ClinicalTrimState.js';

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

  const editingReady = trim.isEditingReady();
  const editingMessage = trim.getEditingReadyMessage();
  const run = (fn: () => void): void => {
    fn();
    session.notifyUi();
  };

  const previewReady = trim.controller.isPreviewReady();
  const interaction = deriveTrimInteractionState({
    state,
    previewReady,
    pointerDrawing: trim.controller.isPointerCaptured()
  });
  const guide = trimGuidedMessage(interaction, state.drawMode);
  const doc = session.getPublicState().activeCase;
  const targetObj = doc?.objects.find((o) => o.id === state.targetObjectId);
  const activeArch =
    targetObj?.archRole === 'upper' || targetObj?.archRole === 'lower'
      ? targetObj.archRole
      : undefined;
  const hasUpper = doc?.objects.some((o) => o.archRole === 'upper') === true;
  const hasLower = doc?.objects.some((o) => o.archRole === 'lower') === true;
  const trimming = interaction === 'COMMITTING' || interaction === 'DRAWING';

  const setMode = (mode: TrimDrawMode): void => {
    run(() => {
      trim.setDrawMode(mode);
    });
  };

  const modeBtn = (mode: TrimDrawMode, label: string, testId: string) => (
    <button
      type="button"
      className={
        state.drawMode === mode ||
        (mode === 'lasso' && state.drawMode === 'freehand') ||
        (mode === 'curve' && state.drawMode === 'polyline')
          ? 'clinical-trim-btn clinical-trim-btn--active'
          : 'clinical-trim-btn'
      }
      data-testid={testId}
      aria-pressed={state.drawMode === mode}
      disabled={!editingReady && mode !== 'idle'}
      title={editingReady ? label : (editingMessage ?? undefined)}
      onClick={() => setMode(mode)}
    >
      {label}
    </button>
  );

  return (
    <div
      className="clinical-trim-toolbar clinical-trim-toolbar--workstation"
      data-testid="clinical-trim-toolbar"
      data-interaction-state={interaction}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="clinical-trim-toolbar__group">
        <span className="clinical-trim-toolbar__label">Trim</span>
        {modeBtn('plane', 'Plane', 'clinical-trim-plane')}
        {modeBtn('lasso', 'Lasso', 'clinical-trim-lasso')}
        {modeBtn('curve', 'Curve', 'clinical-trim-curve')}
        <button
          type="button"
          className="clinical-trim-btn clinical-trim-btn--sr-only"
          data-testid="clinical-trim-freehand"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setMode('lasso')}
        />
        <button
          type="button"
          className="clinical-trim-btn clinical-trim-btn--sr-only"
          data-testid="clinical-trim-polyline"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setMode('curve')}
        />
      </div>

      <div className="clinical-trim-toolbar__group">
        <ClinicalArchSwitcher
          active={activeArch}
          hasUpper={hasUpper}
          hasLower={hasLower}
          showBoth={false}
          testId="clinical-trim-arch"
          disabled={trimming}
          onSelect={(mode) =>
            run(() => {
              if (mode === 'upper' || mode === 'lower') {
                const r = trim.setActiveArch(mode);
                if (!r.ok) {
                  session.getHost().notifications.push('warning', 'Trim', r.error.message);
                }
              }
            })
          }
        />
      </div>

      <div className="clinical-trim-toolbar__group">
        <button
          type="button"
          className="clinical-trim-btn clinical-trim-btn--secondary"
          data-testid="clinical-trim-clear"
          title="Clear unfinished gesture"
          onClick={() =>
            run(() => {
              trim.clearBoundary();
            })
          }
        >
          Clear
        </button>
        <button
          type="button"
          className="clinical-trim-btn clinical-trim-btn--done"
          data-testid="clinical-trim-done"
          disabled={trimming}
          onClick={() =>
            run(() => {
              // DONE → Base when arches ready
              trim.cancel();
              workspace.archContext.setMode('upper');
              const entered = workspace.closeBase.enter();
              if (!entered.ok) {
                session.getHost().notifications.push('warning', 'Base', entered.error.message);
                return;
              }
              workspace.closeBase.setActiveArch('upper');
              session.getHost().notifications.push(
                'info',
                'Base',
                'Upper arch — set Height, then Create Base.'
              );
            })
          }
        >
          Done
        </button>
      </div>

      <div className="clinical-trim-toolbar__guide" data-testid="clinical-trim-guide">
        {trimming
          ? 'TRIMMING…'
          : !editingReady && editingMessage !== undefined
            ? editingMessage
            : guide}
      </div>
    </div>
  );
};
