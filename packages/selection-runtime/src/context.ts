import type { SelectionConfiguration } from './configuration.js';
import type { SelectionEvents } from './events.js';
import type {
  InteractionSessionId,
  SelectionClock,
  SelectionSessionId
} from './types.js';

/**
 * Immutable session context for selection operations.
 */
export interface SelectionContext {
  readonly sessionId: SelectionSessionId;
  readonly interactionSessionId: InteractionSessionId | undefined;
  readonly configuration: SelectionConfiguration;
  readonly clock: SelectionClock;
  readonly events: SelectionEvents;
  readonly signal: AbortSignal | undefined;
}
