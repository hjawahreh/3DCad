import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { ClinicalArchSwitcher } from '../shell/ClinicalArchSwitcher.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { deriveTrimInteractionState } from './ClinicalTrimInteractionState.js';

/**
 * Trim toolbar — always above the drawing overlay (separate pointer ownership).
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
  const archMode = useSyncExternalStore(
    (cb) => workspace.archContext.subscribe(() => cb()),
    () => workspace.archContext.getMode(),
    () => workspace.archContext.getMode()
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

  const doc = session.getPublicState().activeCase;
  const targetObj = doc?.objects.find((o) => o.id === state.targetObjectId);
  const activeArch = archMode;
  const hasUpper = doc?.objects.some((o) => o.archRole === 'upper') === true;
  const hasLower = doc?.objects.some((o) => o.archRole === 'lower') === true;
  const previewReady = trim.controller.isPreviewReady();
  const interaction = deriveTrimInteractionState({
    state,
    previewReady,
    pointerDrawing: trim.controller.isPointerCaptured()
  });

  const targetLabel = (() => {
    if (targetObj === undefined) return 'No target';
    const tool = workspace.archContext.getToolTarget();
    if (archMode === 'both') {
      return `Both visible · Tool: ${tool === 'upper' ? 'Upper' : 'Lower'}`;
    }
    if (targetObj.archRole === 'upper') return 'Upper Arch · Active';
    if (targetObj.archRole === 'lower') return 'Lower Arch · Active';
    return targetObj.displayName;
  })();

  return (
    <div
      className="clinical-trim-toolbar"
      data-testid="clinical-trim-toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="clinical-trim-toolbar__group">
        <span className="clinical-trim-toolbar__label">Arch</span>
        <ClinicalArchSwitcher
          active={activeArch}
          hasUpper={hasUpper}
          hasLower={hasLower}
          testId="clinical-trim-arch"
          onSelect={(mode) =>
            run(() => {
              trim.setArchVisibility(mode);
            })
          }
        />
      </div>
      <div className="clinical-trim-toolbar__group">
        <span className="clinical-trim-toolbar__label">Draw</span>
        <button
          type="button"
          className={
            state.drawMode === 'polyline'
              ? interaction === 'DRAWING' || interaction === 'CLOSED' || interaction === 'PREVIEWING'
                ? 'clinical-trim-btn clinical-trim-btn--active clinical-trim-btn--drawing'
                : 'clinical-trim-btn clinical-trim-btn--active clinical-trim-btn--armed'
              : 'clinical-trim-btn'
          }
          data-testid="clinical-trim-polyline"
          data-armed={state.drawMode === 'polyline' ? 'true' : 'false'}
          data-interaction-state={interaction}
          aria-pressed={state.drawMode === 'polyline'}
          onClick={() =>
            run(() => {
              trim.setDrawMode('polyline');
            })
          }
        >
          {state.drawMode === 'polyline'
            ? interaction === 'DRAWING'
              ? `Polyline · ${String(state.points.length)}`
              : 'Polyline Active'
            : 'Polyline'}
        </button>
        <button
          type="button"
          className={
            state.drawMode === 'freehand'
              ? interaction === 'DRAWING' || interaction === 'CLOSED' || interaction === 'PREVIEWING'
                ? 'clinical-trim-btn clinical-trim-btn--active clinical-trim-btn--drawing'
                : 'clinical-trim-btn clinical-trim-btn--active clinical-trim-btn--armed'
              : 'clinical-trim-btn'
          }
          data-testid="clinical-trim-freehand"
          data-armed={state.drawMode === 'freehand' ? 'true' : 'false'}
          data-interaction-state={interaction}
          aria-pressed={state.drawMode === 'freehand'}
          onClick={() =>
            run(() => {
              trim.setDrawMode('freehand');
            })
          }
        >
          {state.drawMode === 'freehand'
            ? interaction === 'DRAWING'
              ? `Freehand · ${String(state.points.length)}`
              : 'Freehand Active'
            : 'Freehand'}
        </button>
        <span
          className="clinical-trim-toolbar__state muted"
          data-testid="clinical-trim-tool-state"
        >
          {interaction}
        </span>
      </div>
      <div className="clinical-trim-toolbar__group">
        <button
          type="button"
          className="clinical-trim-btn"
          data-testid="clinical-trim-undo-point"
          onClick={() =>
            run(() => {
              trim.undoPoint();
            })
          }
        >
          Undo Pt
        </button>
        <button
          type="button"
          className="clinical-trim-btn"
          data-testid="clinical-trim-doc-undo"
          disabled={!trim.history.canUndo()}
          title="Document undo (accepted trims)"
          onClick={() =>
            run(() => {
              trim.undo();
            })
          }
        >
          Undo
        </button>
        <button
          type="button"
          className="clinical-trim-btn"
          data-testid="clinical-trim-doc-redo"
          disabled={!trim.history.canRedo()}
          title="Document redo"
          onClick={() =>
            run(() => {
              trim.redo();
            })
          }
        >
          Redo
        </button>
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
          className="clinical-trim-btn"
          data-testid="clinical-trim-close"
          onClick={() =>
            run(() => {
              // Inline Trim status is primary — avoid duplicate sticky warnings.
              trim.closeBoundary();
            })
          }
        >
          Close
        </button>
        <button
          type="button"
          className="clinical-trim-btn"
          data-testid="clinical-trim-validate"
          onClick={() =>
            run(() => {
              // Inline status / stats carry validation feedback (no toast flood).
              trim.validate();
            })
          }
        >
          Validate
        </button>
      </div>
      <div className="clinical-trim-toolbar__group clinical-trim-toolbar__actions">
        <button
          type="button"
          className="clinical-trim-btn"
          data-testid="clinical-trim-preview"
          disabled={
            state.points.length < 3 ||
            !state.closed ||
            (state.validationReport !== undefined && !state.validationReport.passed)
          }
          title="Preview clipped geometry (non-destructive)"
          onClick={() =>
            runAsync(async () => {
              const result = await trim.preview();
              if (!result.ok) {
                session.getHost().notifications.push('warning', 'Trim', result.error.message);
              }
            })
          }
        >
          Preview
        </button>
        <button
          type="button"
          className="clinical-trim-btn clinical-trim-btn--accept"
          data-testid="clinical-trim-accept"
          disabled={
            state.points.length < 3 ||
            !state.closed ||
            (state.validationReport !== undefined && !state.validationReport.passed) ||
            !previewReady
          }
          title={
            state.points.length < 3
              ? 'Add at least 3 points.'
              : !state.closed
                ? 'Close the boundary.'
                : state.validationReport !== undefined && !state.validationReport.passed
                  ? state.validationReport.checks.find((c) => !c.passed)?.message ??
                    'Validate the boundary first.'
                  : !previewReady
                    ? 'Run Preview before Accept Trim.'
                    : 'Accept Trim'
          }
          onClick={() =>
            runAsync(async () => {
              const result = await trim.accept();
              if (!result.ok) {
                session.getHost().notifications.push('warning', 'Trim', result.error.message);
              }
            })
          }
        >
          Accept Trim
        </button>
        <button
          type="button"
          className="clinical-trim-btn"
          data-testid="clinical-trim-cancel-preview"
          disabled={!previewReady}
          onClick={() =>
            run(() => {
              trim.cancelPreview();
            })
          }
        >
          Cancel Preview
        </button>
        <button
          type="button"
          className="clinical-trim-btn clinical-trim-btn--cancel"
          data-testid="clinical-trim-cancel"
          onClick={() =>
            run(() => {
              trim.cancel();
            })
          }
        >
          Cancel
        </button>
        <button
          type="button"
          className="clinical-trim-btn"
          data-testid="clinical-trim-reset"
          onClick={() =>
            run(() => {
              trim.resetDrawing();
            })
          }
        >
          Reset
        </button>
      </div>
      <div className="clinical-trim-toolbar__status muted" data-testid="clinical-trim-target">
        {targetLabel}
      </div>
      <div className="clinical-trim-toolbar__status muted">{state.statusMessage}</div>
      <div className="clinical-trim-toolbar__stats" data-testid="clinical-trim-stats">
        {state.validationReport !== undefined
          ? `Points: ${String(state.points.length)} · Closed: ${state.closed ? 'yes' : 'no'}${
              state.validationReport.passed
                ? ` · Boundary valid${previewReady ? ' · Preview ready' : ''}`
                : ` · ${state.validationReport.checks.find((c) => !c.passed)?.message ?? 'Invalid'}`
            }`
          : `Mode: ${state.drawMode} · Points: ${String(state.points.length)}${
              state.closed ? ' · Closed' : ''
            }`}
      </div>
    </div>
  );
};
