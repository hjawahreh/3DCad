import { useSyncExternalStore } from 'react';
import type { StudioCompositionRoot } from '../application/composition-root.js';
import { PLATFORM_PACKAGES } from '../application/diagnostics.js';

export const DialogHostView = ({ root }: { readonly root: StudioCompositionRoot }): React.JSX.Element | null => {
  const dialog = useSyncExternalStore(
    (onChange) => root.dialogs.subscribe(() => onChange()),
    () => root.dialogs.get(),
    () => root.dialogs.get()
  );
  if (dialog === undefined) {
    return null;
  }

  const close = (): void => root.dialogs.close();

  return (
    <div className="overlay-backdrop" role="presentation" onClick={close}>
      <div className="overlay-card overlay-card--wide" role="dialog" aria-label={dialog.title} onClick={(e) => e.stopPropagation()}>
        <header className="overlay-card__header">
          <h2>{dialog.title}</h2>
          <button type="button" onClick={close} aria-label="Close">
            ×
          </button>
        </header>
        <div className="overlay-card__body">
          {dialog.kind === 'import' ? <ImportDialogBody root={root} onClose={close} /> : null}
          {dialog.kind === 'settings' ? <SettingsDialogBody root={root} /> : null}
          {dialog.kind === 'diagnostics' ? <DiagnosticsDialogBody root={root} /> : null}
          {dialog.kind === 'about' ? (
            <p>
              {root.configuration.appName} {root.configuration.appVersion}
              <br />
              Desktop host composing certified platform packages. No clinical tools in APP-001.
            </p>
          ) : null}
          {dialog.kind === 'open-project' ? (
            <p className="muted">
              Open Project is a host placeholder. Persistence I/O remains host-owned; file pickers arrive with native
              dialog integration.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const ImportDialogBody = ({
  root,
  onClose
}: {
  readonly root: StudioCompositionRoot;
  readonly onClose: () => void;
}): React.JSX.Element => {
  const runImport = async (): Promise<void> => {
    root.metrics.recordImportAttempt();
    const progress = root.notifications.push('progress', 'Import', 'Importing…', 0.15);
    const request = root.runtimes.import.createRequest({
      source: 'file://placeholder.stl',
      fileName: 'placeholder.stl',
      ...(root.sessions.projectSession !== undefined
        ? { projectSessionId: root.sessions.projectSession.sessionId }
        : {})
    });
    root.notifications.updateProgress(progress.id, 0.55, 'Resolving importer…');
    const result = await root.runtimes.import.import(request);
    if (!result.ok) {
      root.notifications.dismiss(progress.id);
      root.notifications.push('error', 'Import failed', result.error.message);
      return;
    }
    root.notifications.dismiss(progress.id);
    root.notifications.push('success', 'Import', 'Import completed (passthrough document)');
    onClose();
  };

  return (
    <div>
      <p>
        Import Runtime is connected. Format parsers are not implemented in APP-001; a passthrough importer produces an
        immutable document descriptor.
      </p>
      <button type="button" className="primary" onClick={() => void runImport()}>
        Run Placeholder Import
      </button>
    </div>
  );
};

const SettingsDialogBody = ({ root }: { readonly root: StudioCompositionRoot }): React.JSX.Element => {
  const settings = root.settings.get();
  return (
    <div className="settings-form">
      <label>
        Theme
        <select
          value={settings.theme}
          onChange={(event) => {
            const theme = event.target.value === 'light' ? 'light' : 'dark';
            root.settings.update({ theme });
            root.theme.apply(theme);
          }}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label>
        Language
        <select value={settings.language} disabled>
          <option value="en">English</option>
          <option value="future">Future</option>
        </select>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.viewport.showGrid}
          onChange={(event) =>
            root.settings.update({
              viewport: { ...settings.viewport, showGrid: event.target.checked }
            })
          }
        />
        Show viewport grid
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.autosave.enabled}
          onChange={(event) =>
            root.settings.update({
              autosave: { ...settings.autosave, enabled: event.target.checked }
            })
          }
        />
        Enable autosave
      </label>
      <label>
        Target FPS
        <input
          type="number"
          min={15}
          max={120}
          value={settings.viewport.targetFps}
          onChange={(event) =>
            root.settings.update({
              viewport: {
                ...settings.viewport,
                targetFps: Number(event.target.value) || 60
              }
            })
          }
        />
      </label>
    </div>
  );
};

const DiagnosticsDialogBody = ({ root }: { readonly root: StudioCompositionRoot }): React.JSX.Element => {
  const snap = root.diagnostics.snapshot();
  const metrics = root.metrics.snapshot();
  return (
    <div>
      <h3>Loaded packages</h3>
      <ul className="sidebar__list">
        {PLATFORM_PACKAGES.map((pkg) => (
          <li key={pkg.name}>
            {pkg.name} <span className="muted">{pkg.version}</span>
          </li>
        ))}
      </ul>
      <h3>Performance</h3>
      <dl className="kv">
        <dt>Startup</dt>
        <dd>{Math.round(metrics.startupDurationMs)} ms</dd>
        <dt>GPU backend</dt>
        <dd>{snap.gpuBackend ?? 'n/a'}</dd>
        <dt>Projects created</dt>
        <dd>{metrics.projectCreateCount}</dd>
      </dl>
      <h3>Logs</h3>
      <div className="bottom-panel__body" style={{ maxHeight: 180 }}>
        {snap.logs.slice(-20).map((log) => (
          <div key={log.id} className={`log-line log-line--${log.severity}`}>
            [{log.source}] {log.message}
          </div>
        ))}
      </div>
    </div>
  );
};
