import { useCallback, useEffect, useState } from 'react';
import type { StudioCompositionRoot } from '../application/composition-root.js';
import { WorkspaceHost } from '../hosts/WorkspaceHost.js';
import { CommandPalette } from './CommandPalette.js';
import { DialogHostView } from './DialogHost.js';
import { ModalHostView } from './ModalHost.js';
import { NotificationHostView } from './NotificationHost.js';

export interface StudioShellProps {
  readonly root: StudioCompositionRoot;
}

export const StudioShell = ({ root }: StudioShellProps): React.JSX.Element => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const commandId = root.hotkeys.resolve(event);
      if (commandId === undefined) {
        return;
      }
      event.preventDefault();
      if (commandId === 'app.commandPalette') {
        togglePalette();
        return;
      }
      void root.commands.invoke(commandId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [root, togglePalette]);

  return (
    <div className="studio-shell" data-testid="studio-shell">
      <WorkspaceHost root={root} onTogglePalette={togglePalette} />
      <CommandPalette root={root} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NotificationHostView root={root} />
      <ModalHostView root={root} />
      <DialogHostView root={root} />
    </div>
  );
};
