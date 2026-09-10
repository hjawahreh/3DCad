/**
 * Lightweight vector helpers for analysis — wraps camera-runtime math.
 * Does not introduce a new transform system.
 */

import {
  add,
  cross,
  distance,
  dot,
  length,
  normalize,
  scale,
  sub
} from '@cad-studio/camera-runtime';
import type { Vec3 } from '@cad-studio/camera-runtime';
import type { AnalysisVec3 } from '../types.js';

export const toVec3 = (p: AnalysisVec3 | readonly [number, number, number]): Vec3 => {
  if (Array.isArray(p)) {
    return { x: p[0]!, y: p[1]!, z: p[2]! };
  }
  const v = p as AnalysisVec3;
  return { x: v.x, y: v.y, z: v.z };
};

export const fromVec3 = (p: Vec3): AnalysisVec3 =>
  Object.freeze({ x: p.x, y: p.y, z: p.z });

export const fromTuple = (t: readonly [number, number, number]): AnalysisVec3 =>
  Object.freeze({ x: t[0], y: t[1], z: t[2] });

export const tupleOf = (p: AnalysisVec3): readonly [number, number, number] =>
  Object.freeze([p.x, p.y, p.z] as const);

export const vAdd = (a: AnalysisVec3, b: AnalysisVec3): AnalysisVec3 =>
  fromVec3(add(toVec3(a), toVec3(b)));

export const vSub = (a: AnalysisVec3, b: AnalysisVec3): AnalysisVec3 =>
  fromVec3(sub(toVec3(a), toVec3(b)));

export const vScale = (a: AnalysisVec3, s: number): AnalysisVec3 =>
  fromVec3(scale(toVec3(a), s));

export const vDot = (a: AnalysisVec3, b: AnalysisVec3): number =>
  dot(toVec3(a), toVec3(b));

export const vCross = (a: AnalysisVec3, b: AnalysisVec3): AnalysisVec3 =>
  fromVec3(cross(toVec3(a), toVec3(b)));

export const vLength = (a: AnalysisVec3): number => length(toVec3(a));

export const vNormalize = (a: AnalysisVec3): AnalysisVec3 =>
  fromVec3(normalize(toVec3(a)));

export const vDistance = (a: AnalysisVec3, b: AnalysisVec3): number =>
  distance(toVec3(a), toVec3(b));

export const midpoint = (a: AnalysisVec3, b: AnalysisVec3): AnalysisVec3 =>
  vScale(vAdd(a, b), 0.5);
