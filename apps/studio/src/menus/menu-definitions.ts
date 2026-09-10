export const STUDIO_MENUS = Object.freeze({
  File: Object.freeze([
    Object.freeze({ id: 'project.new', label: 'New Project', shortcut: 'Ctrl+N', enabled: true }),
    Object.freeze({ id: 'project.open', label: 'Open Project…', shortcut: 'Ctrl+O', enabled: true }),
    Object.freeze({ id: 'project.recent', label: 'Recent Projects', enabled: true }),
    Object.freeze({ id: 'separator-1', label: '-', enabled: false }),
    Object.freeze({ id: 'import.open', label: 'Import…', shortcut: 'Ctrl+I', enabled: true }),
    Object.freeze({ id: 'separator-2', label: '-', enabled: false }),
    Object.freeze({ id: 'project.close', label: 'Close Project', enabled: true }),
    Object.freeze({ id: 'app.quit', label: 'Quit', shortcut: 'Ctrl+Q', enabled: false })
  ]),
  Edit: Object.freeze([
    Object.freeze({ id: 'edit.undo', label: 'Undo', shortcut: 'Ctrl+Z', enabled: false }),
    Object.freeze({ id: 'edit.redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', enabled: false }),
    Object.freeze({ id: 'separator-3', label: '-', enabled: false }),
    Object.freeze({ id: 'edit.cut', label: 'Cut', enabled: false }),
    Object.freeze({ id: 'edit.copy', label: 'Copy', enabled: false }),
    Object.freeze({ id: 'edit.paste', label: 'Paste', enabled: false })
  ]),
  View: Object.freeze([
    Object.freeze({ id: 'view.toggleLeft', label: 'Left Sidebar', enabled: true }),
    Object.freeze({ id: 'view.toggleRight', label: 'Right Sidebar', enabled: true }),
    Object.freeze({ id: 'view.toggleBottom', label: 'Bottom Panel', enabled: true }),
    Object.freeze({ id: 'separator-4', label: '-', enabled: false }),
    Object.freeze({ id: 'viewport.resetCamera', label: 'Reset Camera', enabled: true }),
    Object.freeze({ id: 'viewport.fit', label: 'Fit View', enabled: true }),
    Object.freeze({ id: 'app.commandPalette', label: 'Command Palette…', shortcut: 'Ctrl+Shift+P', enabled: true })
  ]),
  Window: Object.freeze([
    Object.freeze({ id: 'window.minimize', label: 'Minimize', enabled: false }),
    Object.freeze({ id: 'window.zoom', label: 'Zoom', enabled: false }),
    Object.freeze({ id: 'app.settings', label: 'Settings…', enabled: true })
  ]),
  Help: Object.freeze([
    Object.freeze({ id: 'app.diagnostics', label: 'Diagnostics…', enabled: true }),
    Object.freeze({ id: 'import.registry', label: 'Importer Registry…', enabled: true }),
    Object.freeze({ id: 'app.about', label: 'About CAD Studio', enabled: true })
  ])
});

export type MenuBarKey = keyof typeof STUDIO_MENUS;
