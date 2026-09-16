import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  deriveTrimInteractionState,
  trimGuidedMessage
} from './ClinicalTrimInteractionState.js';
import type { TrimDrawMode } from './ClinicalTrimState.js';

/**
 * CLN-WORKSTATION-001 — compact Trim panel.
 * Plane | Lasso | Curve · Done (exit). Release-to-trim handles the cut.
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
        {/* Keep legacy test ids for Freehand/Polyline aliases */}
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
        <button
          type="button"
          className="clinical-trim-btn"
          data-testid="clinical-trim-clear"
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
          onClick={() =>
            run(() => {
              trim.cancel();
            })
          }
        >
          Done
        </button>
      </div>

      <div className="clinical-trim-toolbar__guide" data-testid="clinical-trim-guide">
        {!editingReady && editingMessage !== undefined ? editingMessage : guide}
      </div>
    </div>
  );
};
