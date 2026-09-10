import type { StudioCompositionRoot } from '../application/composition-root.js';
import { useStudioUiRevision } from '../ui/useStudioUiRevision.js';

export const RightSidebar = ({ root }: { readonly root: StudioCompositionRoot }): React.JSX.Element => {
  useStudioUiRevision(root);
  const selection = root.sessions.selectionSession?.getSnapshot();
  const camera = root.sessions.cameraSession?.getSnapshot();
  const importers = root.runtimes.import.getPlugins().list();

  return (
    <div className="sidebar">
      <h2 className="sidebar__title">Inspector</h2>
      <section className="sidebar__section">
        <h3>Selection</h3>
        <p className="muted">
          {selection === undefined
            ? 'Not ready'
            : `${String(selection.ids.length)} selected · rev ${String(selection.revision)}`}
        </p>
      </section>
      <section className="sidebar__section">
        <h3>Camera</h3>
        {camera === undefined ? (
          <p className="muted">Not ready</p>
        ) : (
          <dl className="kv">
            <dt>Eye</dt>
            <dd>
              {camera.eye.x.toFixed(2)}, {camera.eye.y.toFixed(2)}, {camera.eye.z.toFixed(2)}
            </dd>
            <dt>Projection</dt>
            <dd>{camera.projection}</dd>
          </dl>
        )}
      </section>
      <section className="sidebar__section">
        <h3>Importers</h3>
        <ul className="sidebar__list">
          {importers.map((info) => (
            <li key={String(info.id)}>
              {info.name}
              <span className="muted"> · {info.capabilities.extensions.join(', ')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
