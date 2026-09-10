/**
 * Analysis preferences.
 */

export interface ClinicalAnalysisPreferences {
  readonly distanceDigits: number;
  readonly angleDigits: number;
  readonly showAxes: boolean;
  readonly showCentroids: boolean;
  readonly showArchCurve: boolean;
}

export const DEFAULT_ANALYSIS_PREFERENCES: ClinicalAnalysisPreferences = Object.freeze({
  distanceDigits: 2,
  angleDigits: 1,
  showAxes: true,
  showCentroids: true,
  showArchCurve: true
});

export class ClinicalAnalysisPreferencesStore {
  private value: ClinicalAnalysisPreferences = DEFAULT_ANALYSIS_PREFERENCES;
  private readonly listeners = new Set<() => void>();

  public get(): ClinicalAnalysisPreferences {
    return this.value;
  }

  public update(partial: Partial<ClinicalAnalysisPreferences>): void {
    this.value = Object.freeze({ ...this.value, ...partial });
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
