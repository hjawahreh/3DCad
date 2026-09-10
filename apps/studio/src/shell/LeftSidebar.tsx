import type { StudioCompositionRoot } from '../application/composition-root.js';
import { ToolHost } from '../hosts/ToolHost.js';
import { useStudioUiRevision } from '../ui/useStudioUiRevision.js';

export const LeftSidebar = ({ root }: { readonly root: StudioCompositionRoot }): React.JSX.Element => {
  useStudioUiRevision(root);
  const recent = root.runtimes.project.getRecentProjects().list();
  return (
    <div className="sidebar">
      <h2 className="sidebar__title">Explorer</h2>
      <section className="sidebar__section">
        <h3>Project</h3>
        <ul className="sidebar__list">
          <li>
            {root.sessions.projectSession?.getPublicState().snapshot?.metadata.name ?? '— none —'}
          </li>
        </ul>
      </section>
      <section className="sidebar__section">
        <h3>Recent</h3>
        <ul className="sidebar__list">
          {recent.length === 0 ? <li className="muted">No recent projects</li> : null}
          {recent.map((entry) => (
            <li key={String(entry.metadata.id)}>{entry.metadata.name}</li>
          ))}
        </ul>
      </section>
      <ToolHost root={root} />
    </div>
  );
};
