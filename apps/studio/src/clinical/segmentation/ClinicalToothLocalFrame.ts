/**
 * Tooth-local coordinate frames from instance geometry (mesh-local space).
 * Composes with clinical orientation transform downstream — does not bake.
 *
 * Axes are AABB-corner PCA proxies only — NOT clinical mesial-distal /
 * buccal-lingual / long-axis from crown landmarks. Confidence is always
 * capped at `low` so limitations stay explicit until landmarks or a licensed
 * ML provider replace this estimator.
 */

import type { ToothInstancePrediction } from './prediction/types.js';
import type { AnalysisVec3 } from '../analysis/types.js';
import { principalAxesFromPoints } from '../analysis/engine/PrincipalAxes.js';
import { vNormalize } from '../analysis/engine/VecMath.js';

export interface ClinicalToothLocalFrame {
  readonly instanceId: string;
  readonly origin: readonly [number, number, number];
  readonly xAxis: AnalysisVec3;
  readonly yAxis: AnalysisVec3;
  readonly zAxis: AnalysisVec3;
  readonly confidence: 'high' | 'moderate' | 'low' | 'unavailable';
}

export const computeToothLocalFrame = (
  instance: ToothInstancePrediction
): ClinicalToothLocalFrame => {
  const origin = instance.centroid;
  if (instance.faceCount < 3) {
    return Object.freeze({
      instanceId: instance.instanceId,
      origin,
      xAxis: Object.freeze({ x: 1, y: 0, z: 0 }),
      yAxis: Object.freeze({ x: 0, y: 1, z: 0 }),
      zAxis: Object.freeze({ x: 0, y: 0, z: 1 }),
      confidence: 'unavailable'
    });
  }

  // Use bounds corners as a stable proxy when full vertex lists are large.
  const min = instance.bounds.min;
  const max = instance.bounds.max;
  const points: AnalysisVec3[] = [
    Object.freeze({ x: min[0], y: min[1], z: min[2] }),
    Object.freeze({ x: max[0], y: min[1], z: min[2] }),
    Object.freeze({ x: min[0], y: max[1], z: min[2] }),
    Object.freeze({ x: min[0], y: min[1], z: max[2] }),
    Object.freeze({ x: max[0], y: max[1], z: max[2] }),
    Object.freeze({ x: origin[0], y: origin[1], z: origin[2] })
  ];
  const pca = principalAxesFromPoints(points);
  const ax0 = pca.axes[0];
  const ax1 = pca.axes[1];
  const ax2 = pca.axes[2];
  if (ax0 === undefined || ax1 === undefined || ax2 === undefined) {
    return Object.freeze({
      instanceId: instance.instanceId,
      origin,
      xAxis: Object.freeze({ x: 1, y: 0, z: 0 }),
      yAxis: Object.freeze({ x: 0, y: 1, z: 0 }),
      zAxis: Object.freeze({ x: 0, y: 0, z: 1 }),
      confidence: 'unavailable' as const
    });
  }
  const xAxis = vNormalize(ax0);
  const yAxis = vNormalize(ax1);
  const zAxis = vNormalize(ax2);

  // Never elevate above `low` — AABB-PCA is not anatomical MD/BL/LA.
  return Object.freeze({
    instanceId: instance.instanceId,
    origin,
    xAxis,
    yAxis,
    zAxis,
    confidence: 'low'
  });
};

export const computeToothLocalFrames = (
  instances: readonly ToothInstancePrediction[]
): readonly ClinicalToothLocalFrame[] =>
  Object.freeze(instances.map((i) => computeToothLocalFrame(i)));
