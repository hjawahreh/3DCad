/**
 * Tooth-local coordinate system abstraction (CLN-010).
 *
 * Convention (estimated, not clinically authoritative):
 * - Origin: area-weighted / geometric centroid
 * - X (mesiodistal): principal axis most aligned with arch tangent (neighbor direction) when available,
 *   otherwise first PCA axis
 * - Z (apicocoronal): world +Z projected orthogonal to X (crown-up heuristic for oriented models)
 * - Y (buccolingual): Z × X
 *
 * Algorithm versioned so future anatomical conventions can replace this without API breakage.
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import type { ToothInstancePrediction } from '../../segmentation/prediction/types.js';
import {
  ANALYSIS_ALGORITHM_VERSIONS,
  type AnalysisFrame,
  type AnalysisVec3
} from '../types.js';
import { fromTuple, vCross, vDot, vNormalize, vSub } from './VecMath.js';
import { principalAxesFromPoints } from './PrincipalAxes.js';

export const TOOTH_FRAME_VERSION = ANALYSIS_ALGORITHM_VERSIONS.toothFrame;

export const estimateToothLocalFrame = (
  mesh: TriangleMesh,
  instance: ToothInstancePrediction,
  origin: AnalysisVec3,
  archTangent?: AnalysisVec3
): AnalysisFrame => {
  const points: AnalysisVec3[] = [];
  const maxSample = Math.min(instance.vertexIndices.length, 256);
  const step = Math.max(1, Math.floor(instance.vertexIndices.length / maxSample));
  for (let i = 0; i < instance.vertexIndices.length; i += step) {
    const vi = instance.vertexIndices[i]!;
    points.push(
      Object.freeze({
        x: mesh.positions[vi * 3]!,
        y: mesh.positions[vi * 3 + 1]!,
        z: mesh.positions[vi * 3 + 2]!
      })
    );
  }
  if (points.length === 0) {
    points.push(fromTuple(instance.centroid));
  }

  const { axes } = principalAxesFromPoints(points);
  let x = axes[0]!;
  if (archTangent !== undefined) {
    // Choose PCA axis most aligned with arch tangent as mesiodistal.
    let best = x;
    let bestAbs = Math.abs(vDot(x, archTangent));
    for (const axis of axes) {
      const a = Math.abs(vDot(axis, archTangent));
      if (a > bestAbs) {
        bestAbs = a;
        best = axis;
      }
    }
    x = vNormalize(best);
    if (vDot(x, archTangent) < 0) {
      x = Object.freeze({ x: -x.x, y: -x.y, z: -x.z });
    }
  }

  const worldUp = Object.freeze({ x: 0, y: 0, z: 1 });
  let z = vNormalize(vSub(worldUp, Object.freeze({
    x: vDot(worldUp, x) * x.x,
    y: vDot(worldUp, x) * x.y,
    z: vDot(worldUp, x) * x.z
  })));
  if (z.x === 0 && z.y === 0 && z.z === 0) {
    z = axes[2]!;
  }
  const y = vNormalize(vCross(z, x));
  z = vNormalize(vCross(x, y));

  return Object.freeze({
    origin,
    x,
    y,
    z,
    method: 'pca-arch-heuristic',
    version: TOOTH_FRAME_VERSION
  });
};
