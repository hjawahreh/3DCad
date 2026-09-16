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
  const doc = session.getPublicState().activeCase;
  const hasModels = doc !== undefined && doc.objects.length > 0;
  const importProgress = workspace.importCoordinator.notifications.getProgress();

  if (!prefs.showOverlays) {
    return null;
  }

  return (
    <div
      className="clinical-viewport-overlay"
      data-display-mode={render.displayMode}
      data-testid="clinical-viewport-overlay"
      data-axes={prefs.showAxes || render.showAxes ? 'on' : 'off'}
      data-origin={prefs.showOrigin || render.showOrigin ? 'on' : 'off'}
      data-orient-gizmo={prefs.showOrientationIndicator ? 'on' : 'off'}
    >
      {prefs.showOrigin || render.showOrigin ? (
        <div className="clinical-origin" data-testid="clinical-origin" />
      ) : null}
      {prefs.showAxes || render.showAxes ? (
        <div data-testid="clinical-axes-helper" aria-hidden="true">
          <div className="clinical-axis clinical-axis--x" />
          <div className="clinical-axis clinical-axis--y" />
          <div className="clinical-axis clinical-axis--z" />
        </div>
      ) : null}

      {prefs.showOrientationIndicator ? (
        <div
          className="clinical-orient-gizmo"
          data-testid="clinical-orient-gizmo"
          aria-label="Orientation indicator"
        >
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

      {prefs.showBoundingBox && hasModels ? (
        <div className="clinical-bounds-hint" aria-hidden="true" />
      ) : null}

      {hasModels ? (
        <div className="clinical-viewport-badge" data-testid="clinical-viewport-badge">
          {doc.caseMeta.name}
          {' · '}
          {String(doc.objects.filter((o) => o.visible).length)}/{String(doc.objects.length)} visible
          {importProgress.phase === 'importing' || importProgress.phase === 'building-document'
            ? ' · importing…'
            : ''}
        </div>
      ) : null}
    </div>
  );
};
