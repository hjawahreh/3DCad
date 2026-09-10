import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

export const ClinicalViewportOverlay = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const prefs = useSyncExternalStore(
    (cb) => workspace.viewport.preferences.subscribe(cb),
    () => workspace.viewport.preferences.get(),
    () => workspace.viewport.preferences.get()
  );
  const render = useSyncExternalStore(
    (cb) => workspace.viewport.display.subscribe(cb),
    () => workspace.viewport.display.getRenderState(),
    () => workspace.viewport.display.getRenderState()
  );
  const host = session.getHost();
  const doc = session.getPublicState().activeCase;
  const selection = host.sessions.selectionSession?.getSnapshot();
  const importProgress = workspace.importCoordinator.notifications.getProgress();

  if (!prefs.showOverlays) {
    return null;
  }

  return (
    <div className="clinical-viewport-overlay" data-display-mode={render.displayMode}>
      {prefs.showOrigin || render.showOrigin ? <div className="clinical-origin" /> : null}
      {prefs.showAxes || render.showAxes ? (
        <>
          <div className="clinical-axis clinical-axis--x" />
          <div className="clinical-axis clinical-axis--y" />
          <div className="clinical-axis clinical-axis--z" />
        </>
      ) : null}

      {prefs.showOrientationIndicator ? (
        <div className="clinical-orient-gizmo" aria-label="Orientation indicator">
          <span className="gizmo-x">X</span>
          <span className="gizmo-y">Y</span>
          <span className="gizmo-z">Z</span>
        </div>
      ) : null}

      {prefs.showScaleIndicator ? (
        <div className="clinical-scale-bar" aria-label="Scale indicator">
          <div className="clinical-scale-bar__line" />
          <span>10 mm</span>
        </div>
      ) : null}

      {prefs.showBoundingBox && doc !== undefined && doc.objects.length > 0 ? (
        <div className="clinical-bounds-hint" aria-hidden="true" />
      ) : null}

      <div className="clinical-overlay-regions">
        <div className="clinical-overlay-region" data-region="tools" />
        <div className="clinical-overlay-region" data-region="measure">
          <span className="muted">Measure — reserved</span>
        </div>
      </div>

      <div className="clinical-viewport-badge">
        {doc === undefined
          ? 'Empty workspace — create a case or import a model'
          : doc.objects.length === 0
            ? `${doc.caseMeta.name} · no models — Import STL/OBJ/PLY`
            : `${doc.caseMeta.name} · ${String(doc.objects.filter((o) => o.visible).length)}/${String(doc.objects.length)} visible · ${render.displayMode}`}
        {selection !== undefined && selection.ids.length > 0
          ? ` · sel ${String(selection.ids.length)}`
          : ''}
        {importProgress.phase === 'importing' || importProgress.phase === 'building-document'
          ? ` · importing…`
          : ''}
      </div>
    </div>
  );
};
