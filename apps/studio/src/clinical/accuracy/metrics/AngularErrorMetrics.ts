/**
 * CLN-001A — angular / axis error helpers for orientation accuracy.
 */

export type Vec3 = readonly [number, number, number];

const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Angle between unit directions in degrees (0..180). */
export const axisAngularErrorDegrees = (predicted: Vec3, reference: Vec3): number => {
  const a = normalize(predicted);
  const b = normalize(reference);
  const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  return (Math.acos(Math.abs(dot)) * 180) / Math.PI;
};

export interface OrientationAxisErrors {
  readonly superiorAxisErrorDegrees: number;
  readonly anteriorAxisErrorDegrees: number;
  readonly lateralAxisErrorDegrees: number;
}

export const orientationAxisErrors = (
  predicted: { readonly superior: Vec3; readonly anterior: Vec3; readonly lateral: Vec3 },
  reference: { readonly superior: Vec3; readonly anterior: Vec3; readonly lateral: Vec3 }
): OrientationAxisErrors =>
  Object.freeze({
    superiorAxisErrorDegrees: axisAngularErrorDegrees(predicted.superior, reference.superior),
    anteriorAxisErrorDegrees: axisAngularErrorDegrees(predicted.anterior, reference.anterior),
    lateralAxisErrorDegrees: axisAngularErrorDegrees(predicted.lateral, reference.lateral)
  });
