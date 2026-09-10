import type { ViewportConfiguration } from './configuration.js';
import type { FrameClock, ViewportId, ViewportSessionId } from './types.js';
import type { ViewportEvents } from './events.js';

/**
 * Immutable projection of session identity and configuration for frame pipeline steps.
 * Ownership: borrowed for the duration of a frame; do not store beyond the frame.
 */
export interface ViewportContext {
  readonly viewportId: ViewportId;
  readonly sessionId: ViewportSessionId;
  readonly configuration: ViewportConfiguration;
  readonly clock: FrameClock;
  readonly events: ViewportEvents;
  readonly signal: AbortSignal | undefined;
}
