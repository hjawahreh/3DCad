/**
 * Clinical transform math — rotations/composites only; no mesh processing.
 */

import { IDENTITY_MAT4, type Mat4 } from '@cad-studio/scene';
import type { ClinicalTransform } from '../import/ClinicalMeshDescriptor.js';

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export const freezeMat4 = (elements: readonly number[]): ClinicalTransform => {
  if (elements.length !== 16) {
    return IDENTITY_MAT4;
  }
  return Object.freeze({
    elements: [
      elements[0]!,
      elements[1]!,
      elements[2]!,
      elements[3]!,
      elements[4]!,
      elements[5]!,
      elements[6]!,
      elements[7]!,
      elements[8]!,
      elements[9]!,
      elements[10]!,
      elements[11]!,
      elements[12]!,
      elements[13]!,
      elements[14]!,
      elements[15]!
    ] as const
  });
};

/** Column-major multiply: out = a * b */
export const multiplyMat4 = (a: Mat4, b: Mat4): ClinicalTransform => {
  const ae = a.elements;
  const be = b.elements;
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        ae[0 * 4 + row]! * be[col * 4 + 0]! +
        ae[1 * 4 + row]! * be[col * 4 + 1]! +
        ae[2 * 4 + row]! * be[col * 4 + 2]! +
        ae[3 * 4 + row]! * be[col * 4 + 3]!;
    }
  }
  return freezeMat4(out);
};

export const rotateXMat4 = (degrees: number): ClinicalTransform => {
  const r = degToRad(degrees);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return freezeMat4([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
};

export const rotateYMat4 = (degrees: number): ClinicalTransform => {
  const r = degToRad(degrees);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return freezeMat4([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
};

export const rotateZMat4 = (degrees: number): ClinicalTransform => {
  const r = degToRad(degrees);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return freezeMat4([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
};

export const rotateAroundAxis = (
  axis: 'x' | 'y' | 'z' | 'free',
  degrees: number,
  freeAxis: 'x' | 'y' | 'z' = 'y'
): ClinicalTransform => {
  if (axis === 'x' || (axis === 'free' && freeAxis === 'x')) {
    return rotateXMat4(degrees);
  }
  if (axis === 'z' || (axis === 'free' && freeAxis === 'z')) {
    return rotateZMat4(degrees);
  }
  return rotateYMat4(degrees);
};

/** Apply delta rotation on the left: preview = delta * baseline (world-space rotate). */
export const applyRotationDelta = (
  baseline: ClinicalTransform,
  delta: ClinicalTransform
): ClinicalTransform => multiplyMat4(delta, baseline);

export const isIdentityTransform = (m: Mat4, epsilon = 1e-6): boolean => {
  const id = IDENTITY_MAT4.elements;
  for (let i = 0; i < 16; i += 1) {
    if (Math.abs((m.elements[i] ?? 0) - (id[i] ?? 0)) > epsilon) {
      return false;
    }
  }
  return true;
};

/**
 * Snap rotation part toward nearest 90° world axes (keeps translation).
 * Extracts approximate Euler from upper 3×3 then quantizes.
 */
export const snapToWorldAxes = (m: Mat4): ClinicalTransform => {
  const e = m.elements;
  // Approximate yaw/pitch/roll from rotation matrix (YXZ)
  const sy = Math.max(-1, Math.min(1, -e[2]!));
  const pitch = Math.asin(sy);
  const yaw = Math.atan2(e[8]!, e[10]!);
  const roll = Math.atan2(e[1]!, e[5]!);
  const quantize = (rad: number): number => {
    const deg = (rad * 180) / Math.PI;
    return Math.round(deg / 90) * 90;
  };
  const rx = rotateXMat4(quantize(pitch));
  const ry = rotateYMat4(quantize(yaw));
  const rz = rotateZMat4(quantize(roll));
  const rotation = multiplyMat4(multiplyMat4(ry, rx), rz);
  // Preserve translation column
  return freezeMat4([
    rotation.elements[0]!,
    rotation.elements[1]!,
    rotation.elements[2]!,
    rotation.elements[3]!,
    rotation.elements[4]!,
    rotation.elements[5]!,
    rotation.elements[6]!,
    rotation.elements[7]!,
    rotation.elements[8]!,
    rotation.elements[9]!,
    rotation.elements[10]!,
    rotation.elements[11]!,
    e[12]!,
    e[13]!,
    e[14]!,
    e[15]!
  ]);
};

export const cloneTransform = (m: Mat4): ClinicalTransform => freezeMat4([...m.elements]);

/**
 * Invert a column-major 4×4 (affine clinical transforms).
 * Returns undefined when the matrix is singular / non-invertible.
 */
export const invertMat4 = (m: Mat4): ClinicalTransform | undefined => {
  const e = m.elements;
  const out = new Array<number>(16);

  out[0] =
    e[5]! * e[10]! * e[15]! -
    e[5]! * e[11]! * e[14]! -
    e[9]! * e[6]! * e[15]! +
    e[9]! * e[7]! * e[14]! +
    e[13]! * e[6]! * e[11]! -
    e[13]! * e[7]! * e[10]!;
  out[4] =
    -e[4]! * e[10]! * e[15]! +
    e[4]! * e[11]! * e[14]! +
    e[8]! * e[6]! * e[15]! -
    e[8]! * e[7]! * e[14]! -
    e[12]! * e[6]! * e[11]! +
    e[12]! * e[7]! * e[10]!;
  out[8] =
    e[4]! * e[9]! * e[15]! -
    e[4]! * e[11]! * e[13]! -
    e[8]! * e[5]! * e[15]! +
    e[8]! * e[7]! * e[13]! +
    e[12]! * e[5]! * e[11]! -
    e[12]! * e[7]! * e[9]!;
  out[12] =
    -e[4]! * e[9]! * e[14]! +
    e[4]! * e[10]! * e[13]! +
    e[8]! * e[5]! * e[14]! -
    e[8]! * e[6]! * e[13]! -
    e[12]! * e[5]! * e[10]! +
    e[12]! * e[6]! * e[9]!;
  out[1] =
    -e[1]! * e[10]! * e[15]! +
    e[1]! * e[11]! * e[14]! +
    e[9]! * e[2]! * e[15]! -
    e[9]! * e[3]! * e[14]! -
    e[13]! * e[2]! * e[11]! +
    e[13]! * e[3]! * e[10]!;
  out[5] =
    e[0]! * e[10]! * e[15]! -
    e[0]! * e[11]! * e[14]! -
    e[8]! * e[2]! * e[15]! +
    e[8]! * e[3]! * e[14]! +
    e[12]! * e[2]! * e[11]! -
    e[12]! * e[3]! * e[10]!;
  out[9] =
    -e[0]! * e[9]! * e[15]! +
    e[0]! * e[11]! * e[13]! +
    e[8]! * e[1]! * e[15]! -
    e[8]! * e[3]! * e[13]! -
    e[12]! * e[1]! * e[11]! +
    e[12]! * e[3]! * e[9]!;
  out[13] =
    e[0]! * e[9]! * e[14]! -
    e[0]! * e[10]! * e[13]! -
    e[8]! * e[1]! * e[14]! +
    e[8]! * e[2]! * e[13]! +
    e[12]! * e[1]! * e[10]! -
    e[12]! * e[2]! * e[9]!;
  out[2] =
    e[1]! * e[6]! * e[15]! -
    e[1]! * e[7]! * e[14]! -
    e[5]! * e[2]! * e[15]! +
    e[5]! * e[3]! * e[14]! +
    e[13]! * e[2]! * e[7]! -
    e[13]! * e[3]! * e[6]!;
  out[6] =
    -e[0]! * e[6]! * e[15]! +
    e[0]! * e[7]! * e[14]! +
    e[4]! * e[2]! * e[15]! -
    e[4]! * e[3]! * e[14]! -
    e[12]! * e[2]! * e[7]! +
    e[12]! * e[3]! * e[6]!;
  out[10] =
    e[0]! * e[5]! * e[15]! -
    e[0]! * e[7]! * e[13]! -
    e[4]! * e[1]! * e[15]! +
    e[4]! * e[3]! * e[13]! +
    e[12]! * e[1]! * e[7]! -
    e[12]! * e[3]! * e[5]!;
  out[14] =
    -e[0]! * e[5]! * e[14]! +
    e[0]! * e[6]! * e[13]! +
    e[4]! * e[1]! * e[14]! -
    e[4]! * e[2]! * e[13]! -
    e[12]! * e[1]! * e[6]! +
    e[12]! * e[2]! * e[5]!;
  out[3] =
    -e[1]! * e[6]! * e[11]! +
    e[1]! * e[7]! * e[10]! +
    e[5]! * e[2]! * e[11]! -
    e[5]! * e[3]! * e[10]! -
    e[9]! * e[2]! * e[7]! +
    e[9]! * e[3]! * e[6]!;
  out[7] =
    e[0]! * e[6]! * e[11]! -
    e[0]! * e[7]! * e[10]! -
    e[4]! * e[2]! * e[11]! +
    e[4]! * e[3]! * e[10]! +
    e[8]! * e[2]! * e[7]! -
    e[8]! * e[3]! * e[6]!;
  out[11] =
    -e[0]! * e[5]! * e[11]! +
    e[0]! * e[7]! * e[9]! +
    e[4]! * e[1]! * e[11]! -
    e[4]! * e[3]! * e[9]! -
    e[8]! * e[1]! * e[7]! +
    e[8]! * e[3]! * e[5]!;
  out[15] =
    e[0]! * e[5]! * e[10]! -
    e[0]! * e[6]! * e[9]! -
    e[4]! * e[1]! * e[10]! +
    e[4]! * e[2]! * e[9]! +
    e[8]! * e[1]! * e[6]! -
    e[8]! * e[2]! * e[5]!;

  const det = e[0]! * out[0]! + e[1]! * out[4]! + e[2]! * out[8]! + e[3]! * out[12]!;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    return undefined;
  }
  const invDet = 1 / det;
  for (let i = 0; i < 16; i += 1) {
    out[i] = out[i]! * invDet;
  }
  return freezeMat4(out);
};

/** Column-major translation matrix. */
export const translateMat4 = (
  tx: number,
  ty: number,
  tz: number
): ClinicalTransform =>
  freezeMat4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1]);

/** Uniform scale about origin (affine tests; clinical orient path stays rigid). */
export const uniformScaleMat4 = (s: number): ClinicalTransform =>
  freezeMat4([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);

/** Transform a point by column-major Mat4 (p' = M * p). */
export const transformPoint3 = (
  m: Mat4,
  point: readonly [number, number, number]
): readonly [number, number, number] => {
  const e = m.elements;
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const w = e[3]! * x + e[7]! * y + e[11]! * z + e[15]!;
  const invW = Math.abs(w) > 1e-12 ? 1 / w : 1;
  return Object.freeze([
    (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) * invW,
    (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) * invW,
    (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) * invW
  ] as const);
};

/** World → local using inverse of object transform. */
export const worldToLocalPoint3 = (
  worldFromLocal: Mat4,
  worldPoint: readonly [number, number, number]
): readonly [number, number, number] | undefined => {
  const inv = invertMat4(worldFromLocal);
  if (inv === undefined) return undefined;
  return transformPoint3(inv, worldPoint);
};
