import type { Aabb, Vec3 } from './types.js';
import { vec3 } from './types.js';

export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);

export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);

export const scale = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  if (len < 1e-12) {
    return vec3(0, 0, 0);
  }
  return scale(a, 1 / len);
};

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

export const aabbCenter = (box: Aabb): Vec3 =>
  vec3(
    (box.min.x + box.max.x) * 0.5,
    (box.min.y + box.max.y) * 0.5,
    (box.min.z + box.max.z) * 0.5
  );

export const aabbRadius = (box: Aabb): number => {
  const cx = (box.max.x - box.min.x) * 0.5;
  const cy = (box.max.y - box.min.y) * 0.5;
  const cz = (box.max.z - box.min.z) * 0.5;
  return Math.hypot(cx, cy, cz);
};

/** Spherical coords relative to target: yaw (around Y), pitch, radius. */
export interface Spherical {
  readonly yaw: number;
  readonly pitch: number;
  readonly radius: number;
}

export const toSpherical = (eye: Vec3, target: Vec3): Spherical => {
  const offset = sub(eye, target);
  const radius = Math.max(1e-6, length(offset));
  const yaw = Math.atan2(offset.x, offset.z);
  const pitch = Math.asin(clamp(offset.y / radius, -1, 1));
  return Object.freeze({ yaw, pitch, radius });
};

export const fromSpherical = (target: Vec3, spherical: Spherical): Vec3 => {
  const cosPitch = Math.cos(spherical.pitch);
  return add(
    target,
    vec3(
      spherical.radius * cosPitch * Math.sin(spherical.yaw),
      spherical.radius * Math.sin(spherical.pitch),
      spherical.radius * cosPitch * Math.cos(spherical.yaw)
    )
  );
};

export const viewBasis = (
  eye: Vec3,
  target: Vec3,
  up: Vec3
): { readonly forward: Vec3; readonly right: Vec3; readonly up: Vec3 } => {
  const forward = normalize(sub(target, eye));
  let right = normalize(cross(forward, up));
  if (length(right) < 1e-8) {
    right = normalize(cross(forward, vec3(0, 0, 1)));
  }
  const trueUp = normalize(cross(right, forward));
  return Object.freeze({ forward, right, up: trueUp });
};
