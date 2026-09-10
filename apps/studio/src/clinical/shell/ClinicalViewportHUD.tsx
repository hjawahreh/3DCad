import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

export const ClinicalViewportHUD = ({
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

  if (!prefs.showHud) {
    return null;
  }

  const host = session.getHost();
  const doc = session.getPublicState().activeCase;
  const viewport = host.sessions.viewportSession;
  const selectionCount = host.sessions.selectionSession?.getSnapshot().ids.length ?? 0;
  const frames = viewport?.getMetrics().snapshot().frameCount ?? 0;
  const avgFrame = viewport?.getMetrics().snapshot().averageFrameTimeMs ?? 0;
  const fps = avgFrame > 0 ? Math.min(120, Math.round(1000 / avgFrame)) : prefs.showFrameStats ? '—' : '—';
  const triCount = doc?.objects.reduce((n, o) => n + (o.faceCount ?? 0), 0) ?? 0;
  const importPhase = workspace.importCoordinator.notifications.getProgress().phase;

  return (
    <div className="clinical-viewport-hud" aria-label="Viewport HUD">
      {prefs.showFrameStats ? <span>FPS {String(fps)}</span> : null}
      <span>Δ {avgFrame > 0 ? avgFrame.toFixed(1) : '—'} ms</span>
      <span>Frames {String(frames)}</span>
      <span>Tris {String(triCount)}</span>
      <span>Objs {String(doc?.objects.length ?? 0)}</span>
      <span>Sel {String(selectionCount)}</span>
      <span>Cam {render.cameraMode}{render.lastPreset ? `/${render.lastPreset}` : ''}</span>
      <span>Disp {render.displayMode}</span>
      <span>Imp {importPhase}</span>
    </div>
  );
};
