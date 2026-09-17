/**
 * CLN-WORKFLOW-002 / GEO-003A — authoritative screen → camera orbit mapping.
 *
 * Single place that converts pointer deltas into Camera Runtime orbit radians.
 * Do not invert signs in Interaction Runtime or OrbitController.
 *
 * Screen coords: +x right, +y down (DOM).
 *
 * Required clinical feel (CLN-WORKFLOW-002):
 *   mouse RIGHT → camera rotates RIGHT → anatomy moves left across viewport
 *   mouse LEFT  → camera rotates LEFT
 *   mouse UP    → camera rotates UP
 *   mouse DOWN  → camera rotates DOWN
 *
 * Mapping (restored to GEO-003A contract — CLN-TRIM-002 positive signs felt reversed):
 *   yaw   = −dx * sensitivity
 *   pitch = −dy * sensitivity
 */

export const ORBIT_SENSITIVITY = 0.005;

export interface OrbitDeltaRadians {
  readonly yaw: number;
  readonly pitch: number;
}

/**
 * Map screen-space pointer deltas to Camera Runtime orbit(yaw, pitch).
 */
export const screenDeltaToOrbitRadians = (dx: number, dy: number): OrbitDeltaRadians =>
  Object.freeze({
    yaw: -dx * ORBIT_SENSITIVITY,
    pitch: -dy * ORBIT_SENSITIVITY
  });
