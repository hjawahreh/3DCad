/**
 * Registers default Studio hotkeys.
 */

import type { StudioCompositionRoot } from './composition-root.js';

export const registerStudioHotkeys = (root: StudioCompositionRoot): void => {
  root.hotkeys.register('Mod+Shift+P', 'app.commandPalette');
  root.hotkeys.register('Mod+N', 'project.new');
  root.hotkeys.register('Mod+O', 'project.open');
  root.hotkeys.register('Mod+I', 'import.open');
  root.hotkeys.register('Mod+,', 'app.settings');
};
