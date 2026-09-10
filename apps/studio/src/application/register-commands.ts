/**
 * Registers application / project / viewport / runtime commands (no clinical).
 */

import type { StudioCompositionRoot } from './composition-root.js';

export const registerStudioCommands = (root: StudioCompositionRoot): void => {
  const { commands, metrics } = root;

  const wrap =
    (run: () => void | Promise<void>) =>
    async (): Promise<void> => {
      metrics.recordCommandInvoke();
      await run();
    };

  commands.register({
    id: 'app.settings',
    title: 'Open Settings',
    category: 'application',
    shortcut: 'Mod+,',
    enabled: true,
    run: wrap(() => {
      root.dialogs.open('settings', 'Settings');
    })
  });

  commands.register({
    id: 'app.diagnostics',
    title: 'Show Diagnostics',
    category: 'runtime',
    enabled: true,
    run: wrap(() => {
      root.dialogs.open('diagnostics', 'Diagnostics');
    })
  });

  commands.register({
    id: 'app.about',
    title: 'About CAD Studio',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      root.dialogs.open('about', 'About CAD Studio');
    })
  });

  commands.register({
    id: 'app.commandPalette',
    title: 'Command Palette',
    category: 'application',
    shortcut: 'Mod+Shift+P',
    enabled: true,
    run: wrap(() => {
      /* toggled by shell */
    })
  });

  commands.register({
    id: 'project.new',
    title: 'New Project',
    category: 'project',
    shortcut: 'Mod+N',
    enabled: true,
    run: wrap(() => {
      root.sessions.projectSession?.dispose();
      const created = root.runtimes.project.createSession();
      if (!created.ok) {
        root.notifications.push('error', 'Project', created.error.message);
        return;
      }
      const result = created.value.create({ name: 'Untitled Project' });
      if (!result.ok) {
        root.notifications.push('error', 'Project', result.error.message);
        created.value.dispose();
        return;
      }
      root.sessions.projectSession = created.value;
      root.metrics.recordProjectCreate();
      root.notifications.push('success', 'Project', 'Created Untitled Project');
      root.notifyUi();
    })
  });

  commands.register({
    id: 'project.open',
    title: 'Open Project…',
    category: 'project',
    shortcut: 'Mod+O',
    enabled: true,
    run: wrap(() => {
      root.dialogs.open('open-project', 'Open Project');
    })
  });

  commands.register({
    id: 'project.close',
    title: 'Close Project',
    category: 'project',
    enabled: true,
    run: wrap(() => {
      const session = root.sessions.projectSession;
      if (session === undefined) {
        root.notifications.push('info', 'Project', 'No project open');
        return;
      }
      session.close();
      session.dispose();
      root.sessions.projectSession = undefined;
      root.metrics.recordProjectClose();
      root.notifications.push('info', 'Project', 'Project closed');
      root.notifyUi();
    })
  });

  commands.register({
    id: 'project.recent',
    title: 'Recent Projects',
    category: 'project',
    enabled: true,
    run: wrap(() => {
      const recent = root.runtimes.project.getRecentProjects().list();
      const names = recent.map((e) => e.metadata.name).join(', ') || 'None';
      root.notifications.push('info', 'Recent Projects', names);
    })
  });

  commands.register({
    id: 'import.open',
    title: 'Import…',
    category: 'import',
    shortcut: 'Mod+I',
    enabled: true,
    run: wrap(() => {
      root.dialogs.open('import', 'Import');
    })
  });

  commands.register({
    id: 'import.registry',
    title: 'Show Importers',
    category: 'import',
    enabled: true,
    run: wrap(() => {
      const plugins = root.runtimes.import.getPlugins().list();
      const summary = plugins
        .map((info) => `${info.name} (${info.capabilities.extensions.join(', ')})`)
        .join('; ');
      root.notifications.push('info', 'Importers', summary || 'No importers registered');
    })
  });

  commands.register({
    id: 'viewport.resetCamera',
    title: 'Reset Camera',
    category: 'viewport',
    enabled: true,
    run: wrap(() => {
      root.sessions.cameraSession?.resetView();
      root.sessions.viewportSession?.invalidate('camera-reset');
    })
  });

  commands.register({
    id: 'viewport.fit',
    title: 'Fit View',
    category: 'viewport',
    enabled: true,
    run: wrap(() => {
      root.sessions.cameraSession?.fitAll({
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 }
      });
      root.sessions.viewportSession?.invalidate('fit');
    })
  });

  commands.register({
    id: 'view.toggleLeft',
    title: 'Toggle Left Sidebar',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      const layout = root.layout.get();
      root.layout.update({ leftCollapsed: !layout.leftCollapsed });
    })
  });

  commands.register({
    id: 'view.toggleRight',
    title: 'Toggle Right Sidebar',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      const layout = root.layout.get();
      root.layout.update({ rightCollapsed: !layout.rightCollapsed });
    })
  });

  commands.register({
    id: 'view.toggleBottom',
    title: 'Toggle Bottom Panel',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      const layout = root.layout.get();
      root.layout.update({ bottomCollapsed: !layout.bottomCollapsed });
    })
  });

  commands.register({
    id: 'window.minimize',
    title: 'Minimize Window',
    category: 'window',
    enabled: false,
    run: wrap(() => undefined)
  });
};
