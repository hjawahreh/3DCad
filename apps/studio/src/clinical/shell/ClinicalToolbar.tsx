import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

export const ClinicalToolbar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const tools = session.getTools().list();
  const activeId = session.getTools().getActive()?.id;

  return (
    <div className="clinical-toolbar" role="toolbar" aria-label="Clinical tools">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={
            activeId === tool.id
              ? 'clinical-tool clinical-tool--active'
              : 'clinical-tool'
          }
          disabled={!tool.enabled}
          title={tool.tooltip}
          aria-pressed={activeId === tool.id}
          onClick={() => {
            const result = session.activateTool(tool.id);
            if (!result.ok) {
              session.notifyUi();
              return;
            }
            if (tool.icon === 'import') {
              session.getHost().dialogs.open('import', 'Import Mesh');
            }
            if (tool.icon === 'orient') {
              const entered = workspace.orientation.enter();
              if (!entered.ok) {
                session.getHost().notifications.push(
                  'warning',
                  'Orientation',
                  entered.error.message
                );
              }
            }
            if (tool.icon === 'trim') {
              const entered = workspace.trim.enter();
              if (!entered.ok) {
                session.getHost().notifications.push('warning', 'Trim', entered.error.message);
              }
            }
            if (tool.icon === 'close-base') {
              const entered = workspace.closeBase.enter();
              if (!entered.ok) {
                session.getHost().notifications.push('warning', 'Close Base', entered.error.message);
              }
            }
            session.notifyUi();
          }}
        >
          <span className={`clinical-tool__icon clinical-tool__icon--${tool.icon}`} />
          <span className="clinical-tool__label">{tool.title}</span>
          {tool.shortcut !== undefined ? (
            <kbd className="clinical-tool__kbd">{tool.shortcut.replace('Mod+', '⌘')}</kbd>
          ) : null}
        </button>
      ))}
    </div>
  );
};
