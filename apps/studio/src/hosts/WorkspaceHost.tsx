import { useSyncExternalStore } from 'react';
import type { StudioCompositionRoot } from '../application/composition-root.js';
import type { StudioLayoutState } from '../application/layout-persistence.js';
import { BottomPanel } from '../shell/BottomPanel.js';
import { Header } from '../shell/Header.js';
import { LeftSidebar } from '../shell/LeftSidebar.js';
import { RightSidebar } from '../shell/RightSidebar.js';
import { StatusBar } from '../shell/StatusBar.js';
import { ViewportHost } from './ViewportHost.js';

export interface WorkspaceHostProps {
  readonly root: StudioCompositionRoot;
  readonly onTogglePalette: () => void;
}

const subscribeLayout = (_root: StudioCompositionRoot, onStoreChange: () => void): (() => void) => {
  const handler = (): void => onStoreChange();
  window.addEventListener('studio-layout-changed', handler);
  return () => window.removeEventListener('studio-layout-changed', handler);
};

export const notifyLayoutChanged = (): void => {
  window.dispatchEvent(new Event('studio-layout-changed'));
};

export const WorkspaceHost = ({ root, onTogglePalette }: WorkspaceHostProps): React.JSX.Element => {
  const layout = useSyncExternalStore(
    (onStoreChange) => subscribeLayout(root, onStoreChange),
    () => root.layout.get(),
    (): StudioLayoutState => root.layout.get()
  );

  const updateLayout = (partial: Partial<StudioLayoutState>): void => {
    root.layout.update(partial);
    notifyLayoutChanged();
  };

  return (
    <div className="workspace-host">
      <Header root={root} onTogglePalette={onTogglePalette} />
      <div className="workspace-body">
        {!layout.leftCollapsed ? (
          <aside className="panel panel-left" style={{ width: layout.leftWidth }}>
            <LeftSidebar root={root} />
            <button
              type="button"
              className="panel-collapse"
              aria-label="Collapse left panel"
              onClick={() => updateLayout({ leftCollapsed: true })}
            >
              ‹
            </button>
          </aside>
        ) : (
          <button
            type="button"
            className="panel-expand panel-expand-left"
            aria-label="Expand left panel"
            onClick={() => updateLayout({ leftCollapsed: false })}
          >
            ›
          </button>
        )}

        <main className="workspace-main">
          <div className="viewport-region">
            <ViewportHost root={root} showGrid={root.settings.get().viewport.showGrid} />
          </div>
          {!layout.bottomCollapsed ? (
            <div className="panel panel-bottom" style={{ height: layout.bottomHeight }}>
              <BottomPanel root={root} />
              <button
                type="button"
                className="panel-collapse panel-collapse-bottom"
                aria-label="Collapse bottom panel"
                onClick={() => updateLayout({ bottomCollapsed: true })}
              >
                ˅
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="panel-expand panel-expand-bottom"
              aria-label="Expand bottom panel"
              onClick={() => updateLayout({ bottomCollapsed: false })}
            >
              ˄
            </button>
          )}
        </main>

        {!layout.rightCollapsed ? (
          <aside className="panel panel-right" style={{ width: layout.rightWidth }}>
            <RightSidebar root={root} />
            <button
              type="button"
              className="panel-collapse panel-collapse-right"
              aria-label="Collapse right panel"
              onClick={() => updateLayout({ rightCollapsed: true })}
            >
              ›
            </button>
          </aside>
        ) : (
          <button
            type="button"
            className="panel-expand panel-expand-right"
            aria-label="Expand right panel"
            onClick={() => updateLayout({ rightCollapsed: false })}
          >
            ‹
          </button>
        )}
      </div>
      <StatusBar root={root} />
    </div>
  );
};
