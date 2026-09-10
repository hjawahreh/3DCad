import type { CameraConfiguration } from './configuration.js';
import type { CameraEvents } from './events.js';
import type {
  CameraClock,
  CameraSessionId,
  InteractionSessionId,
  ViewportId
} from './types.js';

/**
 * Immutable session context for camera operations.
 * Ownership: borrowed for the duration of an update.
 */
export interface CameraContext {
  readonly sessionId: CameraSessionId;
  readonly viewportId: ViewportId | undefined;
  readonly interactionSessionId: InteractionSessionId | undefined;
  readonly configuration: CameraConfiguration;
  readonly clock: CameraClock;
  readonly events: CameraEvents;
  readonly signal: AbortSignal | undefined;
}
