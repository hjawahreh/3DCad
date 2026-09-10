export interface ProjectConfiguration {
  readonly autosaveEnabled: boolean;
  readonly autosaveIntervalMs: number;
  readonly maxRecentProjects: number;
  readonly allowMultipleOpen: boolean;
  readonly defaultReadOnly: boolean;
}

export const DEFAULT_PROJECT_CONFIGURATION: ProjectConfiguration = Object.freeze({
  autosaveEnabled: true,
  autosaveIntervalMs: 30_000,
  maxRecentProjects: 20,
  allowMultipleOpen: false,
  defaultReadOnly: false
});

export const resolveProjectConfiguration = (
  partial: Partial<ProjectConfiguration> = {}
): ProjectConfiguration =>
  Object.freeze({
    autosaveEnabled: partial.autosaveEnabled ?? DEFAULT_PROJECT_CONFIGURATION.autosaveEnabled,
    autosaveIntervalMs:
      partial.autosaveIntervalMs ?? DEFAULT_PROJECT_CONFIGURATION.autosaveIntervalMs,
    maxRecentProjects:
      partial.maxRecentProjects ?? DEFAULT_PROJECT_CONFIGURATION.maxRecentProjects,
    allowMultipleOpen:
      partial.allowMultipleOpen ?? DEFAULT_PROJECT_CONFIGURATION.allowMultipleOpen,
    defaultReadOnly: partial.defaultReadOnly ?? DEFAULT_PROJECT_CONFIGURATION.defaultReadOnly
  });
