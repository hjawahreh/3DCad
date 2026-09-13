/**
 * Clinical auto-orientation estimator — deterministic arch-frame estimation.
 * Uses first-party PCA (analysis PrincipalAxes). Does not mutate mesh buffers.
 *
 * Clinical frame (document coordinateSystem: rhs-y-up):
 *   +X = patient's left  (screen-right in anterior view)
 *   +Y = superior
 *   +Z = anterior (toward the clinician looking at the patient)
 *
 * Case-level rigid transform only — upper/lower bite relationship preserved.
 */

import { principalAxesFromPoints } from '../analysis/engine/PrincipalAxes.js';
import type { AnalysisVec3 } from '../analysis/types.js';
import { vCross, vDot, vNormalize, vScale, vSub } from '../analysis/engine/VecMath.js';
import { freezeMat4 } from './ClinicalTransformMath.js';
import type { ClinicalTransform } from '../import/ClinicalMeshDescriptor.js';

export const AUTO_ORIENTATION_ALGORITHM_VERSION = 'clinical-auto-orient-v1';

export type OrientationConfidence = 'high' | 'medium' | 'low' | 'unavailable';

export type OrientationEstimateSource = 'auto' | 'manual';

export interface ClinicalArchSample {
  readonly objectId: string;
  readonly archRole: 'upper' | 'lower' | undefined;
  readonly positions: Float32Array;
  readonly indices: Uint32Array | undefined;
}

export interface ClinicalOrientationEstimate {
  readonly ok: boolean;
  readonly transform: ClinicalTransform;
  readonly confidence: OrientationConfidence;
  readonly method: string;
  readonly algorithmVersion: string;
  readonly hasUpper: boolean;
  readonly hasLower: boolean;
  readonly warnings: readonly string[];
  readonly message: string;
  readonly axes: {
    readonly left: AnalysisVec3;
    readonly superior: AnalysisVec3;
    readonly anterior: AnalysisVec3;
    readonly centroid: AnalysisVec3;
  };
}

const emptyAxes = (): ClinicalOrientationEstimate['axes'] =>
  Object.freeze({
    left: Object.freeze({ x: 1, y: 0, z: 0 }),
    superior: Object.freeze({ x: 0, y: 1, z: 0 }),
    anterior: Object.freeze({ x: 0, y: 0, z: 1 }),
    centroid: Object.freeze({ x: 0, y: 0, z: 0 })
  });

const identityTransform = (): ClinicalTransform =>
  freezeMat4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const fail = (
  message: string,
  warnings: readonly string[] = []
): ClinicalOrientationEstimate =>
  Object.freeze({
    ok: false,
    transform: identityTransform(),
    confidence: 'unavailable',
    method: 'none',
    algorithmVersion: AUTO_ORIENTATION_ALGORITHM_VERSION,
    hasUpper: false,
    hasLower: false,
    warnings: Object.freeze([...warnings]),
    message,
    axes: emptyAxes()
  });

/** Subsample positions for deterministic PCA (stride based on count). */
export const samplePositions = (
  positions: Float32Array,
  maxPoints = 6000
): AnalysisVec3[] => {
  const count = Math.floor(positions.length / 3);
  if (count <= 0) return [];
  const stride = Math.max(1, Math.ceil(count / maxPoints));
  const out: AnalysisVec3[] = [];
  for (let i = 0; i < count; i += stride) {
    const o = i * 3;
    out.push(
      Object.freeze({
        x: positions[o]!,
        y: positions[o + 1]!,
        z: positions[o + 2]!
      })
    );
  }
  return out;
};

const varianceAlong = (points: readonly AnalysisVec3[], axis: AnalysisVec3, c: AnalysisVec3): number => {
  let acc = 0;
  for (const p of points) {
    const d = (p.x - c.x) * axis.x + (p.y - c.y) * axis.y + (p.z - c.z) * axis.z;
    acc += d * d;
  }
  return points.length === 0 ? 0 : acc / points.length;
};

const meanNormalHint = (positions: Float32Array, indices: Uint32Array | undefined): AnalysisVec3 | undefined => {
  if (indices === undefined || indices.length < 3) return undefined;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const step = Math.max(3, Math.floor(indices.length / 1500) * 3);
  for (let i = 0; i + 2 < indices.length; i += step) {
    const ia = indices[i]! * 3;
    const ib = indices[i + 1]! * 3;
    const ic = indices[i + 2]! * 3;
    const ax = positions[ia]!;
    const ay = positions[ia + 1]!;
    const az = positions[ia + 2]!;
    const bx = positions[ib]!;
    const by = positions[ib + 1]!;
    const bz = positions[ib + 2]!;
    const cx = positions[ic]!;
    const cy = positions[ic + 1]!;
    const cz = positions[ic + 2]!;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    nx += uy * vz - uz * vy;
    ny += uz * vx - ux * vz;
    nz += ux * vy - uy * vx;
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return undefined;
  return Object.freeze({ x: nx / len, y: ny / len, z: nz / len });
};

const centroidOf = (points: readonly AnalysisVec3[]): AnalysisVec3 => {
  if (points.length === 0) return Object.freeze({ x: 0, y: 0, z: 0 });
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  const n = points.length;
  return Object.freeze({ x: sx / n, y: sy / n, z: sz / n });
};

/**
 * Build column-major Mat4: p' = R * (p - centroid).
 * Rows of R are left / superior / anterior so those source directions map to +X/+Y/+Z.
 */
export const mat4FromClinicalAxes = (
  left: AnalysisVec3,
  superior: AnalysisVec3,
  anterior: AnalysisVec3,
  centroid: AnalysisVec3
): ClinicalTransform => {
  const L = vNormalize(left);
  const S = vNormalize(superior);
  const A = vNormalize(anterior);
  // translation t = -R * centroid
  const tx = -(L.x * centroid.x + L.y * centroid.y + L.z * centroid.z);
  const ty = -(S.x * centroid.x + S.y * centroid.y + S.z * centroid.z);
  const tz = -(A.x * centroid.x + A.y * centroid.y + A.z * centroid.z);
  return freezeMat4([
    L.x,
    S.x,
    A.x,
    0,
    L.y,
    S.y,
    A.y,
    0,
    L.z,
    S.z,
    A.z,
    0,
    tx,
    ty,
    tz,
    1
  ]);
};

/**
 * Estimate a case-level clinical orientation from one or more arch meshes.
 */
export const estimateClinicalOrientation = (
  arches: readonly ClinicalArchSample[]
): ClinicalOrientationEstimate => {
  if (arches.length === 0) {
    return fail('Automatic orientation could not be determined. No scan geometry is available.');
  }

  const hasUpper = arches.some((a) => a.archRole === 'upper');
  const hasLower = arches.some((a) => a.archRole === 'lower');
  const warnings: string[] = [];

  const allPoints: AnalysisVec3[] = [];
  const upperPoints: AnalysisVec3[] = [];
  const lowerPoints: AnalysisVec3[] = [];
  let normalHint: AnalysisVec3 | undefined;

  for (const arch of arches) {
    if (arch.positions.length < 9) {
      warnings.push(`${arch.objectId}: insufficient geometry`);
      continue;
    }
    const pts = samplePositions(arch.positions);
    for (const p of pts) allPoints.push(p);
    if (arch.archRole === 'upper') {
      for (const p of pts) upperPoints.push(p);
    } else if (arch.archRole === 'lower') {
      for (const p of pts) lowerPoints.push(p);
    }
    if (normalHint === undefined) {
      normalHint = meanNormalHint(arch.positions, arch.indices);
    }
  }

  if (allPoints.length < 12) {
    return fail(
      'Automatic orientation could not be determined. The scan does not contain enough usable geometry.',
      warnings
    );
  }

  const pca = principalAxesFromPoints(allPoints);
  const c = pca.centroid;
  const ranked = [...pca.axes]
    .map((axis) => Object.freeze({ axis, variance: varianceAlong(allPoints, axis, c) }))
    .sort((a, b) => b.variance - a.variance);

  let lrAxis = ranked[0]!.axis;
  let apAxis = ranked[1]!.axis;
  let siAxis = ranked[2]!.axis;
  const vLR = ranked[0]!.variance;
  const vAP = ranked[1]!.variance;
  const vSI = ranked[2]!.variance;

  if (vLR < 1e-8 || vAP < 1e-8) {
    return fail(
      'Automatic orientation could not be determined. Arch extents are degenerate.',
      warnings
    );
  }

  // --- Superior / inferior ---
  // Dual-arch: prefer upper→lower when it aligns with the thin (occlusal) PCA axis.
  // Real dual-arch fixtures often separate upper/lower along the facial axis instead;
  // in that case PCA thin axis is superior and upper→lower seeds anterior (PROD-002SC).
  let superior: AnalysisVec3;
  let anteriorSeed: AnalysisVec3 | undefined;
  if (upperPoints.length > 0 && lowerPoints.length > 0) {
    const upC = centroidOf(upperPoints);
    const loC = centroidOf(lowerPoints);
    const upFromLo = vNormalize(vSub(upC, loC));
    const occlusalCandidate = vNormalize(siAxis);
    const alignment = Math.abs(vDot(upFromLo, occlusalCandidate));
    if (alignment >= 0.55) {
      superior = upFromLo;
    } else {
      superior = occlusalCandidate;
      if (normalHint !== undefined && vDot(superior, normalHint) < 0) {
        superior = vScale(superior, -1);
      } else if (normalHint === undefined && superior.y < 0) {
        superior = vScale(superior, -1);
      }
      const projected = vSub(upFromLo, vScale(superior, vDot(upFromLo, superior)));
      if (Math.hypot(projected.x, projected.y, projected.z) > 1e-8) {
        anteriorSeed = vNormalize(projected);
      }
    }
    const inPlane = pca.axes
      .map((axis) => {
        const projected = vSub(axis, vScale(superior, vDot(axis, superior)));
        const len = Math.hypot(projected.x, projected.y, projected.z);
        if (len < 1e-8) {
          return undefined;
        }
        const unit = vNormalize(projected);
        return Object.freeze({
          axis: unit,
          variance: varianceAlong(allPoints, unit, c)
        });
      })
      .filter((row): row is { readonly axis: AnalysisVec3; readonly variance: number } => row !== undefined)
      .sort((a, b) => b.variance - a.variance);
    if (inPlane.length >= 2) {
      lrAxis = inPlane[0]!.axis;
      apAxis = anteriorSeed ?? inPlane[1]!.axis;
    } else if (anteriorSeed !== undefined) {
      apAxis = anteriorSeed;
    }
  } else {
    superior = siAxis;
    if (normalHint !== undefined) {
      if (vDot(superior, normalHint) < 0) {
        superior = vScale(superior, -1);
      }
    } else if (superior.y < 0) {
      superior = vScale(superior, -1);
    }
  }
  superior = vNormalize(superior);

  // --- Anterior / posterior via lateral-variance gradient along AP ---
  let anterior = apAxis;
  const binCount = 8;
  const projections = allPoints.map((p) => vDot(vSub(p, c), anterior));
  let minP = Infinity;
  let maxP = -Infinity;
  for (const p of projections) {
    minP = Math.min(minP, p);
    maxP = Math.max(maxP, p);
  }
  const span = Math.max(1e-6, maxP - minP);
  const binVar = new Array<number>(binCount).fill(0);
  const binN = new Array<number>(binCount).fill(0);
  for (let i = 0; i < allPoints.length; i += 1) {
    const p = allPoints[i]!;
    const t = (projections[i]! - minP) / span;
    const bin = Math.min(binCount - 1, Math.max(0, Math.floor(t * binCount)));
    const lat = vDot(vSub(p, c), lrAxis);
    binVar[bin]! += lat * lat;
    binN[bin]! += 1;
  }
  for (let b = 0; b < binCount; b += 1) {
    binVar[b] = binN[b]! > 0 ? binVar[b]! / binN[b]! : 0;
  }
  const posteriorVar = binVar[0]! + binVar[1]!;
  const anteriorVar = binVar[binCount - 1]! + binVar[binCount - 2]!;
  // Anterior tip is the lower lateral-variance end of the U (incisor tip).
  if (anteriorVar > posteriorVar) {
    anterior = vScale(anterior, -1);
  }
  anterior = vNormalize(anterior);
  // Re-orthogonalize AP against superior
  anterior = vNormalize(
    vSub(anterior, vScale(superior, vDot(anterior, superior)))
  );

  // --- Left / right via right-hand rule: left = superior × anterior ---
  let left = vNormalize(vCross(superior, anterior));
  // Ensure orthonormal anterior after left
  anterior = vNormalize(vCross(left, superior));

  // Eigenvalue separation → confidence
  const sepSI = vAP > 1e-12 ? vSI / vAP : 0;
  const sepAP = vLR > 1e-12 ? vAP / vLR : 0;
  let confidence: OrientationConfidence = 'medium';
  if (hasUpper && hasLower && sepSI < 0.85 && sepAP < 0.95) {
    confidence = 'high';
  } else if (sepSI > 0.92 || sepAP > 0.98 || allPoints.length < 80) {
    confidence = 'low';
    warnings.push('Axis separation is weak — orientation needs review.');
  }

  if (!hasUpper && !hasLower) {
    warnings.push('Arch roles were not assigned; orientation used combined geometry.');
    if (confidence === 'high') confidence = 'medium';
  }

  const transform = mat4FromClinicalAxes(left, superior, anterior, c);
  const message =
    confidence === 'low'
      ? 'Orientation needs review.'
      : 'We positioned your scans for clinical review.';

  return Object.freeze({
    ok: true,
    transform,
    confidence,
    method: 'pca-arch-gradient-v1',
    algorithmVersion: AUTO_ORIENTATION_ALGORITHM_VERSION,
    hasUpper,
    hasLower,
    warnings: Object.freeze(warnings),
    message,
    axes: Object.freeze({
      left,
      superior,
      anterior,
      centroid: c
    })
  });
};
