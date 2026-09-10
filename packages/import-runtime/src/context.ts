import type { ImportConfiguration } from './configuration.js';
import type { ImportEvents } from './events.js';
import type { ImportClock, ImportSessionId, ProjectSessionId } from './types.js';

export interface ImportContext {
  readonly sessionId: ImportSessionId;
  readonly projectSessionId: ProjectSessionId | undefined;
  readonly configuration: ImportConfiguration;
  readonly clock: ImportClock;
  readonly events: ImportEvents;
  readonly signal: AbortSignal | undefined;
}
