/**
 * ClinicalAppearanceManager — background, edges, lighting, culling preferences.
 */

import type { ClinicalDisplayPreferencesStore } from './ClinicalDisplayPreferences.js';
import type {
  ClinicalBackgroundTheme,
  ClinicalLightingPreset
} from './ClinicalDisplayPreferences.js';

export class ClinicalAppearanceManager {
  public constructor(private readonly prefs: ClinicalDisplayPreferencesStore) {}

  public setBackground(theme: ClinicalBackgroundTheme): void {
    this.prefs.update({ background: theme });
  }

  public setLighting(preset: ClinicalLightingPreset): void {
    this.prefs.update({ lighting: preset });
  }

  public setGrid(show: boolean): void {
    this.prefs.update({ showGrid: show });
  }

  public setAxes(show: boolean): void {
    this.prefs.update({ showAxes: show });
  }

  public setOrigin(show: boolean): void {
    this.prefs.update({ showOrigin: show });
  }

  /** GEO-003A — bottom-corner XYZ badge (diagnostics / developer only by default). */
  public setOrientationIndicator(show: boolean): void {
    this.prefs.update({ showOrientationIndicator: show });
  }

  public setBoundingBox(show: boolean): void {
    this.prefs.update({ showBoundingBox: show });
  }

  public setModelEdges(show: boolean): void {
    this.prefs.update({ showModelEdges: show });
  }

  public setFaceOrientation(show: boolean): void {
    this.prefs.update({ showFaceOrientation: show });
  }

  public setBackfaceCulling(enabled: boolean): void {
    this.prefs.update({ backfaceCulling: enabled });
  }
}
