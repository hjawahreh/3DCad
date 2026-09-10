/**
 * ClinicalTrimPreferences — trim tool user preferences.
 */

export interface ClinicalTrimPreferences {
  readonly drawMode: 'freehand' | 'polyline';
  readonly showStatistics: boolean;
  readonly showValidationDetails: boolean;
  readonly lockSelection: boolean;
}

export const DEFAULT_TRIM_PREFERENCES: ClinicalTrimPreferences = Object.freeze({
  drawMode: 'polyline',
  showStatistics: true,
  showValidationDetails: true,
  lockSelection: true
});

export class ClinicalTrimPreferencesStore {
  private prefs: ClinicalTrimPreferences = DEFAULT_TRIM_PREFERENCES;
  private readonly listeners = new Set<() => void>();

  public get(): ClinicalTrimPreferences {
    return this.prefs;
  }

  public update(partial: Partial<ClinicalTrimPreferences>): ClinicalTrimPreferences {
    this.prefs = Object.freeze({ ...this.prefs, ...partial });
    this.emit();
    return this.prefs;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
