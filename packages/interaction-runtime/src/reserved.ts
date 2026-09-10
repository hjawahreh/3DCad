/**
 * Reserved contracts for future input channels (COD-009: contracts only).
 * Do not implement recognition / VR / pressure pipelines here.
 */

/** Reserved: advanced multi-touch gesture recognition. */
export interface MultiTouchGestureContract {
  readonly readonly: true;
  readonly gestureType: 'pinch' | 'rotate' | 'pan' | 'swipe' | string;
  readonly scale?: number;
  readonly rotation?: number;
  readonly translation?: { readonly x: number; readonly y: number };
}

/** Reserved: pen pressure / tilt extensions beyond optional pressure on pointer. */
export interface PenPressureExtensionContract {
  readonly readonly: true;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly twist?: number;
}

/** Reserved: VR / spatial controller input. */
export interface VrInputContract {
  readonly readonly: true;
  readonly deviceId: string;
  readonly pose?: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly orientation: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly w: number;
    };
  };
}

export const RESERVED_INPUT_CHANNELS = Object.freeze([
  'multi-touch-gesture',
  'pen-pressure-extension',
  'vr-input'
] as const);
