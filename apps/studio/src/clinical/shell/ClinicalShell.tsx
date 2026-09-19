import { useCallback, useEffect, useState } from 'react';
import { CommandPalette } from '../../shell/CommandPalette.js';
import { NotificationHostView } from '../../shell/NotificationHost.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalBottomPanel } from './ClinicalBottomPanel.js';
import { ClinicalDialogHost } from './ClinicalDialogHost.js';
import { ClinicalDocumentHost } from './ClinicalDocumentHost.js';
import { ClinicalHeader } from './ClinicalHeader.js';
import { ClinicalStatusBar } from './ClinicalStatusBar.js';
import { ClinicalToolPalette } from './ClinicalToolPalette.js';
import { ClinicalWorkflowBar } from './ClinicalWorkflowBar.js';
import { useClinicalLayout } from './useClinicalLayout.js';

/**
 * CLN-WORKSTATION-001 — viewport-first clinical shell.
 * Compact header + tool palette + large viewport. Inspector collapsed by default.
 */
export const ClinicalShell = ({ workspace }: { readonly workspace: ClinicalWorkspace }): React.JSX.Element => {
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
    <div className="clinical-shell clinical-shell--workstation" data-testid="clinical-shell">
      <ClinicalHeader workspace={workspace} onTogglePalette={togglePalette} />
      <ClinicalWorkflowBar workspace={workspace} />
      <div className="clinical-body clinical-body--workstation">
        <aside
          className="clinical-panel clinical-panel--palette"
          style={{ width: layout.leftWidth }}
          data-testid="clinical-workstation-rail"
        >
          <ClinicalToolPalette workspace={workspace} />
        </aside>

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
                aria-label="Collapse diagnostics panel"
                onClick={() => workspace.layout.update({ bottomCollapsed: true })}
              >
                ˅
              </button>
            </div>
          ) : null}
        </main>

      </div>
      <ClinicalStatusBar workspace={workspace} />
      <CommandPalette root={host} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NotificationHostView root={host} />
      <ClinicalDialogHost workspace={workspace} />
    </div>
  );
};
