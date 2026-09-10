/**
 * Per-project settings (persisted with project by host — runtime holds values only).
 */
export interface ProjectSettings {
  readonly units: 'mm' | 'um' | 'custom';
  readonly autosaveOverride: boolean | undefined;
  readonly notes: string;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = Object.freeze({
  units: 'mm',
  autosaveOverride: undefined,
  notes: ''
});

export const resolveProjectSettings = (
  partial: Partial<ProjectSettings> = {}
): ProjectSettings =>
  Object.freeze({
    units: partial.units ?? DEFAULT_PROJECT_SETTINGS.units,
    autosaveOverride:
      'autosaveOverride' in partial
        ? partial.autosaveOverride
        : DEFAULT_PROJECT_SETTINGS.autosaveOverride,
    notes: partial.notes ?? DEFAULT_PROJECT_SETTINGS.notes
  });

/**
 * User preferences spanning projects (runtime-local; host may persist).
 */
export interface ProjectPreferences {
  readonly openLastOnStartup: boolean;
  readonly confirmDiscardDirty: boolean;
  readonly recentProjectsEnabled: boolean;
}

export const DEFAULT_PROJECT_PREFERENCES: ProjectPreferences = Object.freeze({
  openLastOnStartup: true,
  confirmDiscardDirty: true,
  recentProjectsEnabled: true
});

export const resolveProjectPreferences = (
  partial: Partial<ProjectPreferences> = {}
): ProjectPreferences =>
  Object.freeze({
    openLastOnStartup:
      partial.openLastOnStartup ?? DEFAULT_PROJECT_PREFERENCES.openLastOnStartup,
    confirmDiscardDirty:
      partial.confirmDiscardDirty ?? DEFAULT_PROJECT_PREFERENCES.confirmDiscardDirty,
    recentProjectsEnabled:
      partial.recentProjectsEnabled ?? DEFAULT_PROJECT_PREFERENCES.recentProjectsEnabled
  });
