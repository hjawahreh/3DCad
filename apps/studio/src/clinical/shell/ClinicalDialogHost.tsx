import { useSyncExternalStore } from 'react';
import { ModalHostView } from '../../shell/ModalHost.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalImportDialog } from './ClinicalImportDialog.js';
import { PLATFORM_PACKAGES } from '../../application/diagnostics.js';

/**
 * Clinical dialog host — overrides Import with ClinicalImportDialog; reuses settings/about/diagnostics.
 */
export const ClinicalDialogHost = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const host = workspace.getHost();
  const dialog = useSyncExternalStore(
    (onChange) => host.dialogs.subscribe(() => onChange()),
    () => host.dialogs.get(),
    () => host.dialogs.get()
  );

  return (
    <>
      <ModalHostView root={host} />
      {dialog === undefined ? null : (
        <div className="overlay-backdrop" role="presentation" onClick={() => host.dialogs.close()}>
          <div
            className="overlay-card overlay-card--wide"
            role="dialog"
            aria-label={dialog.title}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="overlay-card__header">
              <h2>{dialog.title}</h2>
              <button type="button" onClick={() => host.dialogs.close()} aria-label="Close">
                ×
              </button>
            </header>
            <div className="overlay-card__body">
              {dialog.kind === 'import' ? (
                <ClinicalImportDialog workspace={workspace} onClose={() => host.dialogs.close()} />
              ) : null}
              {dialog.kind === 'settings' ? <SettingsBody workspace={workspace} /> : null}
              {dialog.kind === 'diagnostics' ? <DiagnosticsBody workspace={workspace} /> : null}
              {dialog.kind === 'about' ? (
                <p>
                  CAD Studio — Clinical Orthodontic CAD. Guided workflow from import through
                  segmentation. Use Diagnostics for technical details.
                </p>
              ) : null}
              {dialog.kind === 'open-project' ? (
                <p className="muted">Open Case remains a persistence placeholder.</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const SettingsBody = ({ workspace }: { readonly workspace: ClinicalWorkspace }): React.JSX.Element => {
  const root = workspace.getHost();
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
    </div>
  );
};

const DiagnosticsBody = ({ workspace }: { readonly workspace: ClinicalWorkspace }): React.JSX.Element => {
  const importSnap = workspace.importCoordinator.diagnostics.snapshot();
  const metrics = workspace.importCoordinator.metrics.snapshot();
  return (
    <div>
      <h3>Import metrics</h3>
      <dl className="kv">
        <dt>Attempts</dt>
        <dd>{metrics.importCount}</dd>
        <dt>Success</dt>
        <dd>{metrics.successCount}</dd>
        <dt>Failed</dt>
        <dd>{metrics.failureCount}</dd>
        <dt>Avg duration</dt>
        <dd>{Math.round(metrics.averageDurationMs)} ms</dd>
        <dt>Last importer</dt>
        <dd>{importSnap.lastImporterId ?? '—'}</dd>
      </dl>
      <h3>Packages</h3>
      <ul className="sidebar__list">
        {PLATFORM_PACKAGES.slice(0, 6).map((pkg) => (
          <li key={pkg.name}>
            {pkg.name} <span className="muted">{pkg.version}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
