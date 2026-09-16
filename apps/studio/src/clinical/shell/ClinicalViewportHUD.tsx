import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { buildClinicalWorkflowPresentation } from './ClinicalWorkflowPresentation.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

/**
 * Production-facing viewport HUD. Developer FPS/tris stay behind Diagnostics / frame-stats pref.
 */
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

  const presentation = buildClinicalWorkflowPresentation(workspace);
  const doc = session.getPublicState().activeCase;
  const selectionIds = session.getHost().sessions.selectionSession?.getSnapshot().ids ?? [];
  const selectionCount = selectionIds.length;
  const host = session.getHost();
  const viewport = host.sessions.viewportSession;
  const avgFrame = viewport?.getMetrics().snapshot().averageFrameTimeMs ?? 0;
  const fps = avgFrame > 0 ? Math.min(120, Math.round(1000 / avgFrame)) : '—';
  // CLN-WORKSTATION-001: keep HUD minimal — no triangle counts / fingerprints in clinical mode.
  const visibleArches =
    doc?.objects
      .filter((o) => o.visible)
      .map((o) => o.displayName)
      .slice(0, 2) ?? [];

  return (
    <div className="clinical-viewport-hud" aria-label="Viewport info" data-testid="clinical-viewport-hud">
      <span>{presentation.caseName ?? 'No case'}</span>
      {visibleArches.map((label) => (
        <span key={label}>{label}</span>
      ))}
      {presentation.activeToolLabel !== undefined ? (
        <span>{presentation.activeToolLabel}</span>
      ) : null}
      {selectionCount > 0 ? <span>Selected {String(selectionCount)}</span> : null}
      {prefs.showFrameStats ? (
        <>
          <span className="clinical-viewport-hud__dev">FPS {String(fps)}</span>
          <span className="clinical-viewport-hud__dev">{render.displayMode}</span>
          <span className="clinical-viewport-hud__dev">
            Tris {String(doc?.objects.reduce((n, o) => n + (o.faceCount ?? 0), 0) ?? 0)}
          </span>
        </>
      ) : null}
    </div>
  );
};
