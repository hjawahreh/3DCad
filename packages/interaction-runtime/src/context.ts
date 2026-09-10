import type { InteractionConfiguration } from './configuration.js';
import type { InteractionClock, InteractionSessionId, ViewportId } from './types.js';
import type { InteractionEvents } from './events.js';

/**
 * Immutable projection of session identity for routing steps.
 * Ownership: borrowed for the duration of a dispatch; do not store beyond.
 */
export interface InteractionContext {
  readonly sessionId: InteractionSessionId;
  readonly viewportId: ViewportId | undefined;
  readonly configuration: InteractionConfiguration;
  readonly clock: InteractionClock;
  readonly events: InteractionEvents;
  readonly signal: AbortSignal | undefined;
}
