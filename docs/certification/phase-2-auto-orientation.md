# Phase 2 — Clinical Auto Orientation Certification

**Date:** 2026-09-11  
**Scope:** IMPORT → AUTOMATIC CLINICAL ORIENTATION → PREPARE READY  
**Verdict:** **PASS WITH OBSERVATIONS**

---

## Scope

Implemented automatic clinical orientation with patient-facing anterior presentation. Did **not** implement Auto Prepare, Trim changes, Close Base, Segmentation, Analysis, Movement, Biomechanics, or Treatment Planning.

## Existing infrastructure reused

- `ClinicalOrientationRuntime` / Controller / Session / Manager / History / Gizmo
- Analysis `principalAxesFromPoints` (first-party PCA)
- Camera Runtime via `presentClinicalAnteriorView` / `applyClinicalAnteriorPose`
- Preparation handoff (`notifyOrientationComplete` → `start`)
- Phase 1 case persistence (transforms + new `orientationMeta`)

## Orientation algorithm

`clinical-auto-orient-v1` (`ClinicalAutoOrientationEstimator`):

1. Sample arch positions from MeshRegistry  
2. Combined PCA → variance-ranked axes  
3. Superior from upper/lower relationship (or normals / +Y)  
4. Anterior from lateral-variance gradient (molar vs tip)  
5. Left via RHS cross product  
6. Case-level Mat4 `R (p − c)` previewed then accepted  

## Coordinate convention

Document `rhs-y-up`:

- **+X** = patient's left  
- **+Y** = superior  
- **+Z** = anterior  

## Upper / lower handling

Single case-level transform. Dual-arch and single-arch supported. Relative bite distance preserved under the rigid transform.

## Patient-facing view

After auto preview/accept: fit oriented bounds + anterior pose with `preferClinicalFrame` (+Z look, +Y up, ~18° elevation). Camera is separate from geometry orientation. No per-frame re-fit.

## Confidence

`high` | `medium` | `low` | `unavailable`  
Low → “Orientation needs review.” / Review & Accept. Unavailable → Orient Manually.

## Manual override

Gizmo / rotate / snap mark `orientationOrigin: manual`. Auto does not overwrite unless **Re-Orient** (`force`).

## Persistence

Accepted transforms + `orientationMeta.acceptedAt` saved via Phase 1 store. Re-open restores orientation; enter does not re-auto when already accepted.

## Performance

Sampling capped (~6000 pts). No Open3D. Status messages only (no fake %). See `docs/performance/auto-orientation-benchmarks.md`.

## Tests

| Gate | Result |
|------|--------|
| Typecheck | **PASS** |
| Unit/clinical Vitest | **PASS** — 190 tests (12 new auto-orientation) |
| Build | **PASS** (run with this certification) |
| Browser sanity | **PENDING operator** |

Coverage: determinism, translation/scale invariance, dual-arch superior + relative transform, empty failure, cancel, accept→prepare, persist/reopen, manual lock.

## Browser sanity test

Operator checklist:

1. Create/open dual-arch case with real STLs  
2. Enter Orientation (auto should run)  
3. Confirm patient-facing bite (not sideways/upside-down/flat)  
4. Accept Orientation → Prepare becomes next  
5. Save → reload → Open Case → orientation retained, no surprise re-auto  

## Architecture verification

| Frozen platform | Status |
|-----------------|--------|
| Trim / Close Base / Segmentation | Untouched |
| Viewport / Camera Runtime packages | Untouched (compose only) |
| Geometry Kernel | Consumer of MeshRegistry only |
| Source mesh buffers | Immutable |
| Open3D / new PCA libs | Not introduced |

## Known limitations

1. Heuristic anterior/sign detection can be wrong on atypical or incomplete scans → review path required.  
2. Not clinically validated; language is “estimated / needs review”.  
3. Tiny / degenerate meshes → unavailable confidence.  
4. Camera during preview uses computed oriented bounds override; continuous re-fit avoided.  
5. Full clinical accuracy on all real fixtures needs operator visual confirmation.

## Remaining (out of scope)

Auto Preparation and later pipeline stages.

## Verdict

**PASS WITH OBSERVATIONS**

Automated gates green; architecture rules respected. Upgrade to **PASS** after successful operator browser sanity on real dual-arch fixtures.
