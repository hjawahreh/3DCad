/**
 * Theme Manager — applies Studio theme tokens to the document root.
 */

import type { ThemeId } from './settings.js';

export class ThemeManager {
  private theme: ThemeId = 'dark';

  public getTheme(): ThemeId {
    return this.theme;
  }

  public apply(_theme: ThemeId): void {
    this.theme = 'dark';
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }
}
