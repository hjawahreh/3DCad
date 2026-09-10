import type { ProjectConfiguration } from './configuration.js';
import type { ProjectEvents } from './events.js';
import type { ProjectPreferences } from './settings.js';
import type { ProjectClock, ProjectSessionId } from './types.js';

export interface ProjectContext {
  readonly sessionId: ProjectSessionId;
  readonly configuration: ProjectConfiguration;
  readonly preferences: ProjectPreferences;
  readonly clock: ProjectClock;
  readonly events: ProjectEvents;
  readonly signal: AbortSignal | undefined;
}
