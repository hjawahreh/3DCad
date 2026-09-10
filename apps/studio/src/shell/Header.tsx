import type { StudioCompositionRoot } from '../application/composition-root.js';
import { STUDIO_MENUS, type MenuBarKey } from '../menus/menu-definitions.js';
import { useStudioUiRevision } from '../ui/useStudioUiRevision.js';

export interface HeaderProps {
  readonly root: StudioCompositionRoot;
  readonly onTogglePalette: () => void;
}

export const Header = ({ root, onTogglePalette }: HeaderProps): React.JSX.Element => {
  useStudioUiRevision(root);
  const state = root.sessions.projectSession?.getPublicState();
  const dirty = state?.dirty === true;
  const projectName = state?.snapshot?.metadata.name ?? 'No Project';

  const onMenu = async (id: string): Promise<void> => {
    if (id === 'app.commandPalette') {
      onTogglePalette();
      return;
    }
    await root.commands.invoke(id);
  };

  return (
    <header className="studio-header">
      <div className="studio-brand">
        <span className="studio-brand__mark" aria-hidden="true" />
        <span className="studio-brand__name">CAD Studio</span>
      </div>
      <nav className="studio-menubar" aria-label="Application menu">
        {(Object.keys(STUDIO_MENUS) as MenuBarKey[]).map((key) => (
          <div className="studio-menu" key={key}>
            <button type="button" className="studio-menu__trigger">
              {key}
            </button>
            <div className="studio-menu__dropdown" role="menu">
              {STUDIO_MENUS[key].map((item) =>
                item.label === '-' ? (
                  <div className="studio-menu__sep" key={item.id} />
                ) : (
                  <button
                    type="button"
                    key={item.id}
                    className="studio-menu__item"
                    role="menuitem"
                    disabled={!item.enabled}
                    onClick={() => void onMenu(item.id)}
                  >
                    <span>{item.label}</span>
                    {'shortcut' in item && item.shortcut !== undefined ? (
                      <kbd>{item.shortcut}</kbd>
                    ) : null}
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </nav>
      <div className="studio-header__project">
        <span
          className={dirty ? 'dirty-dot dirty-dot--on' : 'dirty-dot'}
          title={dirty ? 'Unsaved changes' : 'Clean'}
        />
        <span className="studio-header__project-name">{projectName}</span>
      </div>
      <button type="button" className="studio-header__palette" onClick={onTogglePalette}>
        Commands
      </button>
    </header>
  );
};
