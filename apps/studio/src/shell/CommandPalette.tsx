import { useEffect, useMemo, useState } from 'react';
import type { StudioCompositionRoot } from '../application/composition-root.js';
import type { StudioCommand } from '../application/commands.js';

export interface CommandPaletteProps {
  readonly root: StudioCompositionRoot;
  readonly open: boolean;
  readonly onClose: () => void;
}

export const CommandPalette = ({ root, open, onClose }: CommandPaletteProps): React.JSX.Element | null => {
  const [query, setQuery] = useState('');
  const commands = useMemo(() => root.commands.list().filter((c) => c.enabled), [root, open]);

  const filtered = commands.filter((command) => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      return true;
    }
    return (
      command.title.toLowerCase().includes(q) ||
      command.id.toLowerCase().includes(q) ||
      command.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const run = async (command: StudioCommand): Promise<void> => {
    onClose();
    if (command.id === 'app.commandPalette') {
      return;
    }
    await root.commands.invoke(command.id);
  };

  return (
    <div className="palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          className="palette__input"
          autoFocus
          placeholder="Type a command…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onClose();
            }
            if (event.key === 'Enter' && filtered[0] !== undefined) {
              void run(filtered[0]);
            }
          }}
        />
        <ul className="palette__list">
          {filtered.map((command) => (
            <li key={command.id}>
              <button type="button" className="palette__item" onClick={() => void run(command)}>
                <span>{command.title}</span>
                <span className="muted">{command.category}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
