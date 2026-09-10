/**
 * Reserved camera contracts (COD-010: contracts only).
 */

/** Reserved: fly-through / free-flight navigation. */
export interface FlyThroughNavigationContract {
  readonly readonly: true;
  readonly velocity: { readonly x: number; readonly y: number; readonly z: number };
  readonly angularVelocity: { readonly yaw: number; readonly pitch: number; readonly roll: number };
}

/** Reserved: VR HMD camera. */
export interface VrCameraContract {
  readonly readonly: true;
  readonly deviceId: string;
  readonly pose: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly orientation: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly w: number;
    };
  };
}

/** Reserved: stereo / multi-view camera. */
export interface StereoCameraContract {
  readonly readonly: true;
  readonly eyeSeparation: number;
  readonly convergenceDistance: number;
}

/** Reserved: cinematic keyframe animation beyond basic interpolation. */
export interface CinematicAnimationContract {
  readonly readonly: true;
  readonly trackId: string;
  readonly keyframes: readonly unknown[];
}

export const RESERVED_CAMERA_CHANNELS = Object.freeze([
  'fly-through',
  'vr-camera',
  'stereo-camera',
  'cinematic-animation'
] as const);
