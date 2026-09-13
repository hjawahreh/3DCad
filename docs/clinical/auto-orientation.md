# Clinical Auto Orientation

**Algorithm version:** `clinical-auto-orient-v1`  
**Module:** `apps/studio/src/clinical/orientation/ClinicalAutoOrientationEstimator.ts`

## Coordinate convention

CAD Studio clinical documents use **`rhs-y-up`**:

| Axis | Clinical meaning |
|------|------------------|
| **+X** | Patient's left (screen-right in anterior view) |
| **+Y** | Superior |
| **+Z** | Anterior (toward the clinician facing the patient) |

Handedness: `left = superior × anterior` (right-handed).

## Pipeline

1. Sample mesh positions from MeshRegistry (source preferred)
2. Combined PCA (`principalAxesFromPoints` from analysis)
3. Rank axes by variance → left-right / anterior-posterior / superior-inferior
4. Sign superior from upper/lower centroids (or normals / +Y preference)
5. Sign anterior from lateral-variance gradient along the arch (molar end vs tip)
6. Build case-level Mat4: `p' = R (p − centroid)`
7. Preview via existing orientation session (no source mutation)
8. Camera: fit oriented bounds + patient-facing anterior pose (Camera Runtime)
9. Accept commits transform + `orientationMeta` on the document

## Confidence

`high` | `medium` | `low` | `unavailable`

Low confidence surfaces **“Orientation needs review.”** — never claimed clinically correct.

## Upper / lower

One **case-level** transform. Bite relationship is preserved. Single-arch supported.

## Manual override

Manual rotate/gizmo sets `orientationOrigin: manual`. Auto will not overwrite unless **Re-Orient** (`force: true`).

## Persistence

Accepted object transforms + `orientationMeta` survive Phase 1 IndexedDB save/open. Re-open does not re-run auto when `acceptedAt` is set.
