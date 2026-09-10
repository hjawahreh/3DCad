import type { StudioCompositionRoot } from '../application/composition-root.js';
import { useStudioUiRevision } from '../ui/useStudioUiRevision.js';

export const StatusBar = ({ root }: { readonly root: StudioCompositionRoot }): React.JSX.Element => {
  useStudioUiRevision(root);
  const diag = root.diagnostics.snapshot();
  const metrics = root.metrics.snapshot();
  const phase = root.sessions.viewportSession?.getLifecyclePhase() ?? 'idle';
  const selectionCount = root.sessions.selectionSession?.getSnapshot().ids.length ?? 0;

  return (
    <footer className="status-bar">
      <span>Viewport: {phase}</span>
      <span>Selection: {selectionCount}</span>
      <span>Backend: {diag.gpuBackend ?? '—'}</span>
      <span>Startup: {Math.round(metrics.startupDurationMs)}ms</span>
      <span className="status-bar__spacer" />
      <span>
        {diag.errorCount} errors · {diag.warningCount} warnings
      </span>
    </footer>
  );
};
