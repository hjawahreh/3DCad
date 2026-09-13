/**
 * Clinical View Cube — camera pose helpers for canonical views in the clinical frame.
 *
 * Clinical frame (+Y superior, +Z anterior, +X patient left):
 *   FRONT  — look from +Z
 *   BACK   — look from −Z
 *   LEFT   — look from +X
 *   RIGHT  — look from −X
 *   TOP    — look from +Y (occlusal)
 *   BOTTOM — look from −Y
 */

import type { CameraSnapshot, PresetView } from '@cad-studio/camera-runtime';

export type ClinicalViewCubeFace =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom';

export type ClinicalViewCubeRegion = ClinicalViewCubeFace | 'home';

/** View Cube face used for Auto Orient / Home / clinical default (label: Ant). */
export const CANONICAL_CLINICAL_ANTERIOR_FACE: ClinicalViewCubeFace = 'front';

/**
 * Mild elevation for the shared Anterior pose so BOTH arches and occlusion stay readable.
 * Kept small so the closest cube face remains Ant (not Occ).
 */
export const CANONICAL_ANTERIOR_ELEVATION_RAD = (12 * Math.PI) / 180;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ClinicalViewBasis {
  /** Unit direction from target toward eye (where the camera sits). */
  readonly look: Vec3;
  /** Camera up vector for the canonical pose. */
  readonly up: Vec3;
}

const v3 = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return v3(v.x / len, v.y / len, v.z / len);
};

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const add = (...vs: readonly Vec3[]): Vec3 => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const v of vs) {
    x += v.x;
    y += v.y;
    z += v.z;
  }
  return v3(x, y, z);
};

export const CLINICAL_SUPERIOR = v3(0, 1, 0);
export const CLINICAL_ANTERIOR = v3(0, 0, 1);
export const CLINICAL_LEFT = v3(1, 0, 0);

/** Outward look directions for each canonical clinical face. */
export const CLINICAL_VIEW_FACE_BASIS: Readonly<
  Record<ClinicalViewCubeFace, ClinicalViewBasis>
> = Object.freeze({
  front: Object.freeze({ look: v3(0, 0, 1), up: CLINICAL_SUPERIOR }),
  back: Object.freeze({ look: v3(0, 0, -1), up: CLINICAL_SUPERIOR }),
  left: Object.freeze({ look: v3(1, 0, 0), up: CLINICAL_SUPERIOR }),
  right: Object.freeze({ look: v3(-1, 0, 0), up: CLINICAL_SUPERIOR }),
  top: Object.freeze({ look: v3(0, 1, 0), up: v3(0, 0, -1) }),
  bottom: Object.freeze({ look: v3(0, -1, 0), up: v3(0, 0, 1) })
});

/** Camera-runtime presets that align with the clinical frame (left/right are inverted there). */
export const clinicalViewPreset = (
  face: ClinicalViewCubeFace
): PresetView | undefined => {
  if (face === 'front') return 'front';
  if (face === 'back') return 'back';
  if (face === 'top') return 'top';
  if (face === 'bottom') return 'bottom';
  return undefined;
};

export const clinicalViewFromPreset = (preset: PresetView): ClinicalViewCubeFace | undefined => {
  if (preset === 'front') return 'front';
  if (preset === 'back') return 'back';
  if (preset === 'top') return 'top';
  if (preset === 'bottom') return 'bottom';
  return undefined;
};

export const viewDirectionFromSnapshot = (
  snapshot: Pick<CameraSnapshot, 'eye' | 'target'>
): Vec3 => {
  const dx = snapshot.eye.x - snapshot.target.x;
  const dy = snapshot.eye.y - snapshot.target.y;
  const dz = snapshot.eye.z - snapshot.target.z;
  return normalize(v3(dx, dy, dz));
};

export const resolveClosestClinicalFace = (
  snapshot: Pick<CameraSnapshot, 'eye' | 'target'>
): ClinicalViewCubeFace => {
  const viewDir = viewDirectionFromSnapshot(snapshot);
  let best: ClinicalViewCubeFace = 'front';
  let bestDot = -Infinity;
  for (const face of Object.keys(CLINICAL_VIEW_FACE_BASIS) as ClinicalViewCubeFace[]) {
    const d = dot(viewDir, CLINICAL_VIEW_FACE_BASIS[face].look);
    if (d > bestDot) {
      bestDot = d;
      best = face;
    }
  }
  return best;
};

export interface ViewCubeRotationDeg {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Screen-space cube rotation mirroring the camera orbit (world-aligned). */
export const computeViewCubeRotationDeg = (
  snapshot: Pick<CameraSnapshot, 'eye' | 'target' | 'up'>
): ViewCubeRotationDeg => {
  const viewDir = viewDirectionFromSnapshot(snapshot);
  const yawDeg = (Math.atan2(viewDir.x, viewDir.z) * 180) / Math.PI;
  const pitchDeg = (-Math.asin(Math.max(-1, Math.min(1, viewDir.y))) * 180) / Math.PI;

  const forward = normalize(
    v3(
      snapshot.target.x - snapshot.eye.x,
      snapshot.target.y - snapshot.eye.y,
      snapshot.target.z - snapshot.eye.z
    )
  );
  const right = normalize(
    v3(
      forward.y * snapshot.up.z - forward.z * snapshot.up.y,
      forward.z * snapshot.up.x - forward.x * snapshot.up.z,
      forward.x * snapshot.up.y - forward.y * snapshot.up.x
    )
  );
  const rollDeg = (Math.atan2(right.y, right.x) * 180) / Math.PI;

  return Object.freeze({ x: pitchDeg, y: -yawDeg, z: -rollDeg * 0.35 });
};

export const buildClinicalViewSnapshot = (
  current: CameraSnapshot,
  face: ClinicalViewCubeFace,
  targetCenter?: Vec3,
  radiusOverride?: number
): CameraSnapshot => {
  const basis = CLINICAL_VIEW_FACE_BASIS[face];
  const target = targetCenter ?? current.target;
  const radius =
    radiusOverride !== undefined && Number.isFinite(radiusOverride)
      ? Math.max(1, radiusOverride)
      : Math.max(
          1,
          Math.hypot(
            current.eye.x - current.target.x,
            current.eye.y - current.target.y,
            current.eye.z - current.target.z
          )
        );
  let look = basis.look;
  if (face === CANONICAL_CLINICAL_ANTERIOR_FACE) {
    const cosE = Math.cos(CANONICAL_ANTERIOR_ELEVATION_RAD);
    const sinE = Math.sin(CANONICAL_ANTERIOR_ELEVATION_RAD);
    look = normalize(
      v3(
        basis.look.x * cosE + basis.up.x * sinE,
        basis.look.y * cosE + basis.up.y * sinE,
        basis.look.z * cosE + basis.up.z * sinE
      )
    );
  }
  const eye = v3(
    target.x + look.x * radius,
    target.y + look.y * radius,
    target.z + look.z * radius
  );
  return Object.freeze({
    ...current,
    eye: Object.freeze(eye),
    target: Object.freeze({ ...target }),
    up: Object.freeze({ ...basis.up }),
    createdAt: Date.now()
  });
};

/** Bounds center used as the clinical camera target. */
export const clinicalBoundsCenter = (bounds: {
  readonly min: Vec3;
  readonly max: Vec3;
}): Vec3 =>
  v3(
    (bounds.min.x + bounds.max.x) * 0.5,
    (bounds.min.y + bounds.max.y) * 0.5,
    (bounds.min.z + bounds.max.z) * 0.5
  );

export interface ClinicalCameraBasis {
  readonly forward: Vec3;
  readonly up: Vec3;
  readonly target: Vec3;
  readonly distance: number;
  readonly closestFace: ClinicalViewCubeFace;
}

/** Numerical camera basis for Auto Orient ↔ View Cube Ant equality tests. */
export const clinicalCameraBasisFromSnapshot = (
  snapshot: Pick<CameraSnapshot, 'eye' | 'target' | 'up'>
): ClinicalCameraBasis => {
  const forward = viewDirectionFromSnapshot(snapshot);
  const distance = Math.hypot(
    snapshot.eye.x - snapshot.target.x,
    snapshot.eye.y - snapshot.target.y,
    snapshot.eye.z - snapshot.target.z
  );
  return Object.freeze({
    forward,
    up: normalize(v3(snapshot.up.x, snapshot.up.y, snapshot.up.z)),
    target: v3(snapshot.target.x, snapshot.target.y, snapshot.target.z),
    distance,
    closestFace: resolveClosestClinicalFace(snapshot)
  });
};

export const clinicalCameraBasesEqual = (
  a: ClinicalCameraBasis,
  b: ClinicalCameraBasis,
  options?: {
    readonly directionEps?: number;
    readonly targetEps?: number;
    readonly distanceRelEps?: number;
  }
): boolean => {
  const directionEps = options?.directionEps ?? 0.04;
  const targetEps = options?.targetEps ?? 2.5;
  const distanceRelEps = options?.distanceRelEps ?? 0.08;
  const forwardDot = dot(a.forward, b.forward);
  const upDot = dot(a.up, b.up);
  const targetDist = Math.hypot(
    a.target.x - b.target.x,
    a.target.y - b.target.y,
    a.target.z - b.target.z
  );
  const distRef = Math.max(1, a.distance, b.distance);
  const distRel = Math.abs(a.distance - b.distance) / distRef;
  return (
    forwardDot >= 1 - directionEps &&
    upDot >= 1 - directionEps &&
    targetDist <= targetEps &&
    distRel <= distanceRelEps
  );
};

export const buildClinicalCornerSnapshot = (
  current: CameraSnapshot,
  faces: readonly ClinicalViewCubeFace[],
  targetCenter?: Vec3
): CameraSnapshot => {
  const combined = normalize(
    add(...faces.map((face) => CLINICAL_VIEW_FACE_BASIS[face].look))
  );
  const up =
    faces.includes('top') || faces.includes('bottom')
      ? faces.includes('top')
        ? CLINICAL_VIEW_FACE_BASIS.top.up
        : CLINICAL_VIEW_FACE_BASIS.bottom.up
      : CLINICAL_SUPERIOR;
  const target = targetCenter ?? current.target;
  const radius = Math.max(
    1,
    Math.hypot(
      current.eye.x - current.target.x,
      current.eye.y - current.target.y,
      current.eye.z - current.target.z
    )
  );
  const eye = v3(
    target.x + combined.x * radius,
    target.y + combined.y * radius,
    target.z + combined.z * radius
  );
  return Object.freeze({
    ...current,
    eye: Object.freeze(eye),
    target: Object.freeze({ ...target }),
    up: Object.freeze({ ...up }),
    createdAt: Date.now()
  });
};

/** Deterministic basis for unit tests (target at origin, radius 1). */
export const clinicalViewBasisAtOrigin = (
  face: ClinicalViewCubeFace
): { readonly eye: Vec3; readonly target: Vec3; readonly up: Vec3 } => {
  const basis = CLINICAL_VIEW_FACE_BASIS[face];
  return Object.freeze({
    target: v3(0, 0, 0),
    eye: basis.look,
    up: basis.up
  });
};
