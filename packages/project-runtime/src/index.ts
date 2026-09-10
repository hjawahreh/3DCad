export type {
  Brand,
  ProjectClock,
  ProjectError,
  ProjectErrorCode,
  ProjectId,
  ProjectLocationRef,
  ProjectResult,
  ProjectRevision,
  ProjectRuntimeId,
  ProjectScheduler,
  ProjectSessionId
} from './types.js';
export {
  asProjectId,
  asProjectLocationRef,
  asProjectRevision,
  asProjectRuntimeId,
  asProjectSessionId,
  createDefaultProjectClock,
  createDefaultProjectScheduler,
  projectFailure,
  projectSuccess
} from './types.js';

export type { ProjectConfiguration } from './configuration.js';
export {
  DEFAULT_PROJECT_CONFIGURATION,
  resolveProjectConfiguration
} from './configuration.js';

export type { ProjectMetadata } from './metadata.js';
export { createProjectMetadata, touchMetadata } from './metadata.js';

export type { ProjectPreferences, ProjectSettings } from './settings.js';
export {
  DEFAULT_PROJECT_PREFERENCES,
  DEFAULT_PROJECT_SETTINGS,
  resolveProjectPreferences,
  resolveProjectSettings
} from './settings.js';

export type { ProjectLifecyclePhase } from './lifecycle.js';
export { ProjectLifecycle } from './lifecycle.js';

export type {
  ImmutableProjectSnapshot,
  ProjectPublicState,
  ProjectState
} from './state.js';
export { freezeProjectSnapshot } from './state.js';

export type {
  ProjectAutosaveEvent,
  ProjectDirtyEvent,
  ProjectErrorEvent,
  ProjectEvent,
  ProjectEventListener,
  ProjectEventType,
  ProjectHistoryEvent,
  ProjectLifecycleEvent,
  ProjectRecentEvent,
  ProjectSaveEvent,
  ProjectWarningEvent
} from './events.js';
export { ProjectEvents } from './events.js';

export { DirtyStateManager } from './dirty-state.js';

export type { AutosaveRecoveryMetadata } from './autosave.js';
export { AutosaveCoordinator } from './autosave.js';

export type { RecentProjectEntry } from './recent.js';
export { RecentProjectsRegistry } from './recent.js';

export type { ProjectHistoryEntry } from './history.js';
export { ProjectHistoryCoordinator } from './history.js';

export { ProjectManager } from './manager.js';

export type { ProjectMetricsSnapshot } from './metrics.js';
export { ProjectMetrics } from './metrics.js';

export type {
  ProjectDiagnostic,
  ProjectDiagnosticSeverity,
  ProjectDiagnosticsSnapshot
} from './diagnostics.js';
export { ProjectDiagnostics } from './diagnostics.js';

export type { ProjectContext } from './context.js';

export type {
  CloudSynchronizationContract,
  CollaborativeEditingContract,
  MultiUserSessionContract,
  ProjectVersionServerContract
} from './reserved.js';
export { RESERVED_PROJECT_CHANNELS } from './reserved.js';

export type { ProjectSessionOptions } from './session.js';
export { ProjectSession } from './session.js';

export { ProjectRegistry } from './registry.js';

export type { ProjectRuntimeOptions } from './runtime.js';
export { ProjectRuntime } from './runtime.js';
