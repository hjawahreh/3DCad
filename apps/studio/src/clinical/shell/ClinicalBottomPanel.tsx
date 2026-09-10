import type { ClinicalBottomTab } from '../workspace/ClinicalLayout.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalLayout } from './useClinicalLayout.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

const TABS: readonly ClinicalBottomTab[] = Object.freeze([
  'notifications',
  'logs',
  'diagnostics',
  'import',
  'jobs'
]);

export const ClinicalBottomPanel = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const layout = useClinicalLayout(workspace.layout);
  const host = session.getHost();
  const clinicalDiag = session.getDiagnostics().snapshot();
  const hostDiag = host.diagnostics.snapshot();
  const notifications = host.notifications.list();
  const metrics = session.getMetrics().snapshot();
  const viewport = host.sessions.viewportSession;
  const selection = host.sessions.selectionSession?.getSnapshot();
  const camera = host.sessions.cameraSession?.getSnapshot();
  const progress = workspace.importCoordinator.notifications.getProgress();
  const recent = workspace.importCoordinator.notifications.listRecent();
  const importMetrics = workspace.importCoordinator.metrics.snapshot();
  const displayDiag = workspace.viewport.diagnostics.snapshot();
  const displayMetrics = workspace.viewport.metrics.snapshot();
  const orientDiag = workspace.orientation.diagnostics.snapshot();
  const orientMetrics = workspace.orientation.metrics.snapshot();
  return (
    <div className="clinical-bottom">
      <div className="clinical-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={layout.bottomTab === tab ? 'clinical-tab clinical-tab--active' : 'clinical-tab'}
            disabled={tab === 'jobs'}
            title={tab === 'jobs' ? 'Background jobs — reserved' : tab}
            onClick={() => workspace.layout.update({ bottomTab: tab })}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="clinical-bottom__body">
        {layout.bottomTab === 'notifications' ? (
          notifications.length === 0 ? (
            <p className="muted">No notifications.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`log-line log-line--${n.kind}`}>
                <strong>{n.title}</strong> — {n.message}
              </div>
            ))
          )
        ) : null}

        {layout.bottomTab === 'logs' ? (
          <>
            {clinicalDiag.logs.slice(-30).map((log) => (
              <div key={log.id} className={`log-line log-line--${log.severity}`}>
                [clinical/{log.source}] {log.message}
              </div>
            ))}
            {hostDiag.logs.slice(-20).map((log) => (
              <div key={log.id} className={`log-line log-line--${log.severity}`}>
                [host/{log.source}] {log.message}
              </div>
            ))}
          </>
        ) : null}

        {layout.bottomTab === 'diagnostics' ? (
          <dl className="kv">
            <dt>Clinical phase</dt>
            <dd>{clinicalDiag.phase}</dd>
            <dt>Tools</dt>
            <dd>
              {clinicalDiag.enabledToolCount}/{clinicalDiag.toolCount} enabled
            </dd>
            <dt>Bootstrap</dt>
            <dd>{Math.round(metrics.bootstrapDurationMs)} ms</dd>
            <dt>Imports</dt>
            <dd>
              {importMetrics.successCount}/{importMetrics.importCount} ok
            </dd>
            <dt>Viewport</dt>
            <dd>{viewport?.getLifecyclePhase() ?? 'idle'}</dd>
            <dt>Backend</dt>
            <dd>{hostDiag.gpuBackend ?? '—'}</dd>
            <dt>Selection</dt>
            <dd>{selection === undefined ? '—' : `${String(selection.ids.length)} ids`}</dd>
            <dt>Camera</dt>
            <dd>{camera === undefined ? '—' : camera.projection}</dd>
            <dt>Viewport frames</dt>
            <dd>{String(viewport?.getMetrics().snapshot().frameCount ?? 0)}</dd>
            <dt>Display mode changes</dt>
            <dd>{String(displayDiag.displayModeChanges)}</dd>
            <dt>Visibility ops</dt>
            <dd>{String(displayMetrics.visibilityOps)}</dd>
            <dt>Camera fits</dt>
            <dd>{String(displayMetrics.cameraFits)}</dd>
            <dt>Avg refresh</dt>
            <dd>{displayMetrics.averageFrameTimeMs.toFixed(2)} ms</dd>
            <dt>Orientation sessions</dt>
            <dd>{String(orientDiag.sessions)}</dd>
            <dt>Orientations accepted</dt>
            <dd>
              {String(orientDiag.accepted)} · avg {orientMetrics.averageCompletionTimeMs.toFixed(0)}{' '}
              ms
            </dd>
          </dl>
        ) : null}

        {layout.bottomTab === 'import' ? (
          <>
            {progress.phase !== 'idle' ? (
              <div className="log-line">
                [{progress.phase}] {progress.message} ({Math.round(progress.ratio * 100)}%)
              </div>
            ) : (
              <p className="muted">No active import.</p>
            )}
            <h3>Recent</h3>
            {recent.length === 0 ? <p className="muted">No imports yet.</p> : null}
            {recent.map((entry, i) => (
              <div key={`${entry.fileName}-${String(i)}`} className="log-line">
                {entry.success ? '✓' : '✗'} {entry.fileName} · {entry.format} · {entry.objectCount} objects
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
};
