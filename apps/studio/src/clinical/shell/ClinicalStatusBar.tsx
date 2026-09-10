import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

export const ClinicalStatusBar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const host = session.getHost();
  const state = session.getPublicState();
  const viewport = host.sessions.viewportSession;
  const selectionCount = host.sessions.selectionSession?.getSnapshot().ids.length ?? 0;
  const metrics = viewport?.getMetrics().snapshot();
  const diag = host.diagnostics.snapshot();

  return (
    <footer className="clinical-status">
      <span>Clinical: {state.phase}</span>
      <span>Case: {state.activeCase?.caseMeta.name ?? 'none'}</span>
      <span>Viewport: {viewport?.getLifecyclePhase() ?? 'idle'}</span>
      <span>FPS target: {host.settings.get().viewport.targetFps}</span>
      <span>Frames: {String(metrics?.frameCount ?? 0)}</span>
      <span>Selection: {selectionCount}</span>
      <span>Backend: {diag.gpuBackend ?? '—'}</span>
      <span className="status-bar__spacer" />
      <span>
        Tools {session.getDiagnostics().snapshot().enabledToolCount}/
        {session.getDiagnostics().snapshot().toolCount}
      </span>
    </footer>
  );
};
