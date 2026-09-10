/**
 * ClinicalPreparationPreferences — user preferences for preparation UI.
 */

export interface ClinicalPreparationPreferences {
  readonly showTimeline: boolean;
  readonly showValidationDetails: boolean;
  readonly autoAdvanceStages: boolean;
  readonly requireSavedCase: boolean;
}

export const DEFAULT_PREPARATION_PREFERENCES: ClinicalPreparationPreferences = Object.freeze({
  showTimeline: true,
  showValidationDetails: true,
  autoAdvanceStages: false,
  requireSavedCase: false
});

export class ClinicalPreparationPreferencesStore {
  private prefs: ClinicalPreparationPreferences = DEFAULT_PREPARATION_PREFERENCES;
  private readonly listeners = new Set<() => void>();

  public get(): ClinicalPreparationPreferences {
    return this.prefs;
  }

  public update(partial: Partial<ClinicalPreparationPreferences>): ClinicalPreparationPreferences {
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
