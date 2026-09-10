/**
 * Deterministic PCA / principal-axis helpers for tooth orientation.
 */

import type { AnalysisVec3 } from '../types.js';
import { vCross, vDistance, vNormalize } from './VecMath.js';

export const principalAxesFromPoints = (
  points: readonly AnalysisVec3[]
): { readonly axes: readonly AnalysisVec3[]; readonly centroid: AnalysisVec3 } => {
  if (points.length === 0) {
    const z = Object.freeze({ x: 0, y: 0, z: 0 });
    return {
      centroid: z,
      axes: Object.freeze([
        Object.freeze({ x: 1, y: 0, z: 0 }),
        Object.freeze({ x: 0, y: 1, z: 0 }),
        Object.freeze({ x: 0, y: 0, z: 1 })
      ])
    };
  }
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  const n = points.length;
  const c = Object.freeze({ x: sx / n, y: sy / n, z: sz / n });
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const p of points) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dz = p.z - c.z;
    xx += dx * dx;
    yy += dy * dy;
    zz += dz * dz;
    xy += dx * dy;
    xz += dx * dz;
    yz += dy * dz;
  }
  xx /= n;
  yy /= n;
  zz /= n;
  xy /= n;
  xz /= n;
  yz /= n;

  let v1: AnalysisVec3 = Object.freeze({ x: 1, y: 0.1, z: 0.01 });
  for (let i = 0; i < 24; i += 1) {
    const nx = xx * v1.x + xy * v1.y + xz * v1.z;
    const ny = xy * v1.x + yy * v1.y + yz * v1.z;
    const nz = xz * v1.x + yz * v1.y + zz * v1.z;
    v1 = vNormalize(Object.freeze({ x: nx, y: ny, z: nz }));
  }
  let v2: AnalysisVec3 = vNormalize(vCross(v1, Object.freeze({ x: 0, y: 0, z: 1 })));
  if (vDistance(v2, Object.freeze({ x: 0, y: 0, z: 0 })) < 1e-8) {
    v2 = vNormalize(vCross(v1, Object.freeze({ x: 0, y: 1, z: 0 })));
  }
  for (let i = 0; i < 16; i += 1) {
    const nx = xx * v2.x + xy * v2.y + xz * v2.z;
    const ny = xy * v2.x + yy * v2.y + yz * v2.z;
    const nz = xz * v2.x + yz * v2.y + zz * v2.z;
    let cand: AnalysisVec3 = Object.freeze({ x: nx, y: ny, z: nz });
    const proj = cand.x * v1.x + cand.y * v1.y + cand.z * v1.z;
    cand = vNormalize(
      Object.freeze({
        x: cand.x - proj * v1.x,
        y: cand.y - proj * v1.y,
        z: cand.z - proj * v1.z
      })
    );
    v2 = cand;
  }
  const v3 = vNormalize(vCross(v1, v2));
  return { centroid: c, axes: Object.freeze([v1, v2, v3]) };
};
