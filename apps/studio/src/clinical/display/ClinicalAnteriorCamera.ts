/**
 * Clinical anterior camera — patient-facing bite presentation via Camera Runtime.
 * Does not mutate mesh. Uses animateTo + tick (no Camera Runtime package changes).
 *
 * After auto-orientation (rhs-y-up clinical frame):
 *   +Y = superior, +Z = anterior, +X = patient's left
 * Prefer that frame when clinical orientation is available; otherwise infer from AABB.
 */

import type { CameraSession, CameraSnapshot } from '@cad-studio/camera-runtime';
import type { ClinicalBounds } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import { isIdentityTransform } from '../orientation/ClinicalTransformMath.js';
import { CANONICAL_ANTERIOR_ELEVATION_RAD } from './ClinicalViewCubeMath.js';

/**
 * Infer clinical axes from combined AABB:
 * - superior = smallest span (vertical bite axis)
 * - left-right = largest span
 * - anterior = remaining axis (patient-facing look direction)
 *
 * Only for pre-orientation presentation. Do not use when a clinical frame exists.
 */
export const inferClinicalAxes = (
  bounds: ClinicalBounds
): {
  readonly superior: 'x' | 'y' | 'z';
  readonly anterior: 'x' | 'y' | 'z';
  readonly leftRight: 'x' | 'y' | 'z';
} => {
  const sx = bounds.max.x - bounds.min.x;
  const sy = bounds.max.y - bounds.min.y;
  const sz = bounds.max.z - bounds.min.z;
  const ranked: Array<readonly ['x' | 'y' | 'z', number]> = [
    ['x', sx],
    ['y', sy],
    ['z', sz]
  ];
  ranked.sort((a, b) => a[1] - b[1]);
  const superior = ranked[0]![0];
  const anterior = ranked[1]![0];
  const leftRight = ranked[2]![0];
  return { superior, anterior, leftRight };
};

/** CAD Studio clinical frame after accepted orientation. */
export const CLINICAL_FRAME_AXES = Object.freeze({
  superior: 'y' as const,
  anterior: 'z' as const,
  leftRight: 'x' as const
});

/**
 * Prefer clinical +Y/+Z frame when orientation is accepted or transforms are non-identity.
 * Explicit `preferClinicalFrame: false` forces AABB inference (pre-orient / tests only).
 */
export const shouldPreferClinicalFrame = (
  document: ClinicalDocumentSnapshot | undefined,
  options?: { readonly preferClinicalFrame?: boolean }
): boolean => {
  if (options?.preferClinicalFrame === false) {
    return false;
  }
  if (options?.preferClinicalFrame === true) {
    return true;
  }
  if (document?.orientationMeta?.acceptedAt !== undefined) {
    return true;
  }
  return document?.objects.some((obj) => !isIdentityTransform(obj.transform)) === true;
};

export const resolveAnteriorAxes = (
  bounds: ClinicalBounds,
  preferClinicalFrame: boolean
): {
  readonly superior: 'x' | 'y' | 'z';
  readonly anterior: 'x' | 'y' | 'z';
  readonly leftRight: 'x' | 'y' | 'z';
} => (preferClinicalFrame ? CLINICAL_FRAME_AXES : inferClinicalAxes(bounds));

const axisUnit = (
  axis: 'x' | 'y' | 'z',
  sign: 1 | -1
): { readonly x: number; readonly y: number; readonly z: number } => {
  if (axis === 'x') return { x: sign, y: 0, z: 0 };
  if (axis === 'y') return { x: 0, y: sign, z: 0 };
  return { x: 0, y: 0, z: sign };
};

const poseMatches = (snap: CameraSnapshot, target: CameraSnapshot): boolean => {
  const upDot =
    snap.up.x * target.up.x + snap.up.y * target.up.y + snap.up.z * target.up.z;
  return upDot > 0.9;
};

/** Apply a target snapshot immediately when animateTo cannot complete (e.g. fixed test clock). */
export const forceApplyCameraSnapshot = (camera: CameraSession, target: CameraSnapshot): boolean => {
  type CameraInternals = {
    animation: { cancel: () => void };
    manager: {
      apply: (state: {
        eye: CameraSnapshot['eye'];
        target: CameraSnapshot['target'];
        up: CameraSnapshot['up'];
        projection: CameraSnapshot['projection'];
        fovDegrees: number;
        near: number;
        far: number;
        orthoSize: number;
        aspect: number;
        viewportSize: CameraSnapshot['viewportSize'];
      }) => { snapshot: CameraSnapshot };
    };
    lifecycle: { force: (phase: string) => void };
  };
  const internal = camera as unknown as CameraInternals;
  try {
    internal.animation.cancel();
    internal.manager.apply({
      eye: { ...target.eye },
      target: { ...target.target },
      up: { ...target.up },
      projection: target.projection,
      fovDegrees: target.fovDegrees,
      near: target.near,
      far: target.far,
      orthoSize: target.orthoSize,
      aspect: target.aspect,
      viewportSize: { ...target.viewportSize }
    });
    internal.lifecycle.force('ready');
    return poseMatches(camera.getSnapshot(), target);
  } catch {
    return false;
  }
};

export interface AnteriorPoseOptions {
  /**
   * When true, use CAD Studio clinical frame (+Y superior, +Z anterior)
   * established by auto-orientation instead of AABB inference.
   * When false, force AABB inference even if orientation metadata exists.
   */
  readonly preferClinicalFrame?: boolean;
  /** Explicit eye distance from target (mm). When omitted, derived from bounds + FOV. */
  readonly distanceOverride?: number;
}

/** Fit distance so the case fills a useful fraction of the viewport (not world-axis defaults). */
export const computeClinicalFitDistance = (
  bounds: ClinicalBounds,
  fovDegrees: number
): number => {
  const sx = Math.max(1e-3, bounds.max.x - bounds.min.x);
  const sy = Math.max(1e-3, bounds.max.y - bounds.min.y);
  const sz = Math.max(1e-3, bounds.max.z - bounds.min.z);
  const halfDiag = Math.hypot(sx, sy, sz) * 0.5;
  const fovRad = (Math.max(20, Math.min(90, fovDegrees)) * Math.PI) / 180;
  const fromFov = halfDiag / Math.tan(fovRad * 0.5);
  // Margin so BOTH arches stay readable without excessive empty space.
  return Math.max(fromFov * 0.72, halfDiag * 1.35, 8);
};

/**
 * Apply patient-facing anterior bite pose through Camera Runtime animateTo.
 */
export const applyClinicalAnteriorPose = (
  camera: CameraSession,
  bounds: ClinicalBounds,
  options?: AnteriorPoseOptions
): boolean => {
  const snap = camera.getSnapshot();
  const target = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5
  };
  const radius =
    options?.distanceOverride !== undefined && Number.isFinite(options.distanceOverride)
      ? Math.max(1, options.distanceOverride)
      : computeClinicalFitDistance(bounds, snap.fovDegrees);
  const axes = resolveAnteriorAxes(bounds, options?.preferClinicalFrame === true);
  const look = axisUnit(axes.anterior, 1);
  const up = axisUnit(axes.superior, 1);
  const cosE = Math.cos(CANONICAL_ANTERIOR_ELEVATION_RAD);
  const sinE = Math.sin(CANONICAL_ANTERIOR_ELEVATION_RAD);
  const eye = {
    x: target.x + look.x * radius * cosE + up.x * radius * sinE,
    y: target.y + look.y * radius * cosE + up.y * radius * sinE,
    z: target.z + look.z * radius * cosE + up.z * radius * sinE
  };
  const next = Object.freeze({
    ...snap,
    eye: Object.freeze(eye),
    target: Object.freeze(target),
    up: Object.freeze(up),
    createdAt: Date.now()
  });
  const started = camera.animateTo(next, 1);
  if (!started.ok) {
    return forceApplyCameraSnapshot(camera, next);
  }
  const deadline = Date.now() + 50;
  while (Date.now() <= deadline) {
    const tick = camera.tickAnimation();
    if (tick.ok && tick.value.completed) {
      return poseMatches(camera.getSnapshot(), next);
    }
  }
  const last = camera.tickAnimation();
  if (last.ok && last.value.completed && poseMatches(camera.getSnapshot(), next)) {
    return true;
  }
  return forceApplyCameraSnapshot(camera, next);
};
