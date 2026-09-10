import type { StudioCompositionRoot } from '../application/composition-root.js';
import { useStudioUiRevision } from '../ui/useStudioUiRevision.js';

export const BottomPanel = ({ root }: { readonly root: StudioCompositionRoot }): React.JSX.Element => {
  useStudioUiRevision(root);
  const logs = root.diagnostics.snapshot().logs.slice(-40).reverse();
  return (
    <div className="bottom-panel">
      <div className="bottom-panel__tabs">
        <span className="bottom-panel__tab bottom-panel__tab--active">Output</span>
        <span className="bottom-panel__tab">Diagnostics</span>
      </div>
      <div className="bottom-panel__body">
        {logs.length === 0 ? <p className="muted">No diagnostics yet.</p> : null}
        {logs.map((log) => (
          <div key={log.id} className={`log-line log-line--${log.severity}`}>
            <span className="log-line__src">[{log.source}]</span> {log.message}
          </div>
        ))}
      </div>
    </div>
  );
};
