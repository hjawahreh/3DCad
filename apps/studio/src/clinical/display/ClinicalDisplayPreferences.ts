/**
 * Clinical display preferences — persisted per user (localStorage).
 */

export type ClinicalDisplayMode =
  | 'solid'
  | 'wireframe'
  | 'solid-wireframe'
  | 'xray'
  | 'hidden-edge'
  | 'flat'
  | 'smooth';

export type ClinicalBackgroundTheme = 'dark' | 'neutral' | 'clinical-blue' | 'light';

export type ClinicalLightingPreset = 'studio' | 'soft' | 'high-contrast' | 'flat';

export interface ClinicalDisplayPreferences {
  readonly displayMode: ClinicalDisplayMode;
  readonly background: ClinicalBackgroundTheme;
  readonly showGrid: boolean;
  readonly showAxes: boolean;
  readonly showOrigin: boolean;
  readonly showBoundingBox: boolean;
  readonly showModelEdges: boolean;
  readonly showFaceOrientation: boolean;
  readonly backfaceCulling: boolean;
  readonly lighting: ClinicalLightingPreset;
  readonly showOrientationIndicator: boolean;
  readonly showScaleIndicator: boolean;
  readonly showFrameStats: boolean;
  readonly showHud: boolean;
  readonly showOverlays: boolean;
}

export const DEFAULT_CLINICAL_DISPLAY_PREFERENCES: ClinicalDisplayPreferences = Object.freeze({
  displayMode: 'smooth',
  background: 'dark',
  showGrid: true,
  showAxes: true,
  showOrigin: true,
  showBoundingBox: false,
  showModelEdges: false,
  showFaceOrientation: false,
  backfaceCulling: true,
  lighting: 'studio',
  showOrientationIndicator: true,
  showScaleIndicator: true,
  showFrameStats: false,
  showHud: true,
  showOverlays: true
});

export const DISPLAY_MODES: readonly ClinicalDisplayMode[] = Object.freeze([
  'solid',
  'wireframe',
  'solid-wireframe',
  'xray',
  'hidden-edge',
  'flat',
  'smooth'
]);

export class ClinicalDisplayPreferencesStore {
  private readonly storageKey = 'cad-studio.clinical.display.v1';
  private prefs: ClinicalDisplayPreferences;
  private readonly listeners = new Set<() => void>();

  public constructor(initial?: Partial<ClinicalDisplayPreferences>) {
    this.prefs = Object.freeze({
      ...DEFAULT_CLINICAL_DISPLAY_PREFERENCES,
      ...this.load(),
      ...(initial ?? {})
    });
  }

  public get(): ClinicalDisplayPreferences {
    return this.prefs;
  }

  public update(partial: Partial<ClinicalDisplayPreferences>): ClinicalDisplayPreferences {
    this.prefs = Object.freeze({ ...this.prefs, ...partial });
    this.persist();
    for (const listener of this.listeners) {
      listener();
    }
    return this.prefs;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private load(): Partial<ClinicalDisplayPreferences> | undefined {
    if (typeof localStorage === 'undefined') {
      return undefined;
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === null) {
        return undefined;
      }
      return JSON.parse(raw) as Partial<ClinicalDisplayPreferences>;
    } catch {
      return undefined;
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.prefs));
    } catch {
      // ignore
    }
  }
}
