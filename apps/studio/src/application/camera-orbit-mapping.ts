/**
 * CLN-TRIM-002 / GEO-003A — authoritative screen → camera orbit mapping.
 *
 * Single place that converts pointer deltas into Camera Runtime orbit radians.
 * Do not invert signs in Interaction Runtime or OrbitController.
 *
 * Screen coords: +x right, +y down (DOM).
 *
 * Intuitive clinical orbit (grab-the-model / turntable feel):
 *   drag right → view content rotates right → positive yaw (camera swings left)
 *   drag up    → view content rotates up   → positive pitch delta from +dy screen?
 *
 * After CLN-TRIM-002 manual findings reported GEO-003A signs still inverted.
 * Mapping is therefore:
 *   yaw   = +dx * sensitivity  (drag right → positive yaw → eye.x increases from +Z)
 *   pitch = +dy * sensitivity  (drag up (−dy) → negative pitch → eye.y decreases)
 *
 * Verified: composition-root applies this once — no second inversion.
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
    yaw: dx * ORBIT_SENSITIVITY,
    pitch: dy * ORBIT_SENSITIVITY
  });
