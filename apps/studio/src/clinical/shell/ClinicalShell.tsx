import { useCallback, useEffect, useState } from 'react';
import { CommandPalette } from '../../shell/CommandPalette.js';
import { NotificationHostView } from '../../shell/NotificationHost.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalBottomPanel } from './ClinicalBottomPanel.js';
import { ClinicalDialogHost } from './ClinicalDialogHost.js';
import { ClinicalDocumentHost } from './ClinicalDocumentHost.js';
import { ClinicalHeader } from './ClinicalHeader.js';
import { ClinicalLeftPanel } from './ClinicalLeftPanel.js';
import { ClinicalRightPanel } from './ClinicalRightPanel.js';
import { ClinicalStatusBar } from './ClinicalStatusBar.js';
import { ClinicalToolbar } from './ClinicalToolbar.js';
import { useClinicalLayout } from './useClinicalLayout.js';

export interface ClinicalShellProps {
  readonly workspace: ClinicalWorkspace;
}

export const ClinicalShell = ({ workspace }: ClinicalShellProps): React.JSX.Element => {
  const host = workspace.getHost();
  const layout = useClinicalLayout(workspace.layout);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const commandId = host.hotkeys.resolve(event);
      if (commandId === undefined) {
        return;
      }
      event.preventDefault();
      if (commandId === 'app.commandPalette') {
        togglePalette();
        return;
      }
      void host.commands.invoke(commandId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [host, togglePalette]);

  return (
    <div className="clinical-shell" data-testid="clinical-shell">
      <ClinicalHeader workspace={workspace} onTogglePalette={togglePalette} />
      <ClinicalToolbar workspace={workspace} />
      <div className="clinical-body">
        {!layout.leftCollapsed ? (
          <aside className="clinical-panel clinical-panel--left" style={{ width: layout.leftWidth }}>
            <ClinicalLeftPanel workspace={workspace} />
            <button
              type="button"
              className="panel-collapse"
              aria-label="Collapse left panel"
              onClick={() => workspace.layout.update({ leftCollapsed: true })}
            >
              ‹
            </button>
          </aside>
        ) : (
          <button
            type="button"
            className="panel-expand panel-expand-left"
            aria-label="Expand left panel"
            onClick={() => workspace.layout.update({ leftCollapsed: false })}
          >
            ›
          </button>
        )}

        <main className="clinical-main">
          <div className="clinical-viewport-region">
            <ClinicalDocumentHost workspace={workspace} />
          </div>
          {!layout.bottomCollapsed ? (
            <div className="clinical-panel clinical-panel--bottom" style={{ height: layout.bottomHeight }}>
              <ClinicalBottomPanel workspace={workspace} />
              <button
                type="button"
                className="panel-collapse panel-collapse-bottom"
                aria-label="Collapse bottom panel"
                onClick={() => workspace.layout.update({ bottomCollapsed: true })}
              >
                ˅
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="panel-expand panel-expand-bottom"
              aria-label="Expand bottom panel"
              onClick={() => workspace.layout.update({ bottomCollapsed: false })}
            >
              ˄
            </button>
          )}
        </main>

        {!layout.rightCollapsed ? (
          <aside className="clinical-panel clinical-panel--right" style={{ width: layout.rightWidth }}>
            <ClinicalRightPanel workspace={workspace} />
            <button
              type="button"
              className="panel-collapse panel-collapse-right"
              aria-label="Collapse right panel"
              onClick={() => workspace.layout.update({ rightCollapsed: true })}
            >
              ›
            </button>
          </aside>
        ) : (
          <button
            type="button"
            className="panel-expand panel-expand-right"
            aria-label="Expand right panel"
            onClick={() => workspace.layout.update({ rightCollapsed: false })}
          >
            ‹
          </button>
        )}
      </div>
      <ClinicalStatusBar workspace={workspace} />
      <CommandPalette root={host} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NotificationHostView root={host} />
      <ClinicalDialogHost workspace={workspace} />
    </div>
  );
};
