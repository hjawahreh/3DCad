/**
 * ClinicalCloseBasePreferences — close-base user preferences.
 */

import type { CloseBaseStrategyId } from './ClinicalCloseBaseStrategy.js';

export interface ClinicalCloseBasePreferences {
  readonly defaultStrategy: CloseBaseStrategyId;
  readonly showStatistics: boolean;
  readonly showValidationDetails: boolean;
}

export const DEFAULT_CLOSE_BASE_PREFERENCES: ClinicalCloseBasePreferences = Object.freeze({
  defaultStrategy: 'plane',
  showStatistics: true,
  showValidationDetails: true
});

export class ClinicalCloseBasePreferencesStore {
  private prefs: ClinicalCloseBasePreferences = DEFAULT_CLOSE_BASE_PREFERENCES;
  private readonly listeners = new Set<() => void>();

  public get(): ClinicalCloseBasePreferences {
    return this.prefs;
  }

  public update(partial: Partial<ClinicalCloseBasePreferences>): ClinicalCloseBasePreferences {
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
