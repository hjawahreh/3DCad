# PROD-002SC

Canonical anterior clinical orientation (camera presentation).

**Scope:** Auto Orientation camera presentation only — clinical frame + View Cube Ant + BOTH fit.  
**Not in scope:** Movement, segmentation, Trim geometry, Camera Runtime redesign.  
**Clinical product certification:** Not claimed.

**Verdict: PASS**

---

## Reference Behavior

Required automatic presentation matches the supplied anterior/facial reference:

- Upper + Lower visible, arch context **BOTH**
- Anterior/facial view (central incisors readable, occlusion readable)
- Midline approximately centered; useful margins; no occlusal/underside default

Real-fixture Auto Orient screenshot (`01-auto-orient.png`) matches this behavior and the prior PROD-002 facial reference (`prod-002-final-browser-shots/03-orient-accepted.png`).

---

## Canonical Clinical Direction

Clinical frame (document `rhs-y-up`):

| Axis | Meaning |
|------|---------|
| +X | Patient left |
| +Y | Superior |
| +Z | Anterior (toward clinician) |

Canonical camera face: View Cube **`front`** (UI label **Ant**).

Mild shared elevation: `CANONICAL_ANTERIOR_ELEVATION_RAD` (12°) so both arches stay readable without flipping closest face to Occ.

---

## View Cube Mapping

| Cube label | Internal face id | Look (clinical) | Up |
|------------|------------------|-----------------|-----|
| Ant | `front` | +Z (elevated for canonical pose) | +Y |
| Occ | `top` | +Y | −Z |
| Post | `back` | −Z | +Y |
| L / R | `left` / `right` | ±X | +Y |

`CANONICAL_CLINICAL_ANTERIOR_FACE = 'front'`. No second “front” concept.

---

## Camera Basis

Single operation: `ClinicalViewportRuntime.presentCanonicalClinicalView(face)`.

Pipeline:

1. Clinical orientation frame (mesh transform / orientation preview)
2. Face basis from `CLINICAL_VIEW_FACE_BASIS` (+ anterior elevation when face is Ant)
3. Target = center of **visible** oriented bounds (BOTH / UPPER / LOWER)
4. Distance = `computeClinicalFitDistance` (no fixed scan distance)

Exposed for tests: `getClinicalCameraBasis()` → forward, up, target, distance, `closestFace`.

---

## Auto Orientation

On fresh Orientation enter / Re-run Auto Orient:

1. Process feedback
2. Estimate + apply clinical orientation **preview**
3. Set arch context **BOTH** / show all
4. `presentCanonicalClinicalView('front')` with preview-oriented BOTH bounds
5. Clear feedback; enable manual tools

**Critical fix (PROD-002SC):** while Orientation is active, committed `activeCase` transforms may still be identity. Camera already fitted preview-oriented bounds, but `ClinicalMeshViewport` was drawing identity meshes → Ant camera showed an occlusal/underside look. Viewport now resolves display transforms from the orientation preview (`resolveDisplayTransform`) so mesh and camera share one source of truth.

Mesh is **not** given a second presentation-only rotation.

---

## Home

Home ≡ View Cube Ant ≡ Auto Orient camera basis:

- `resetView` / View Cube Home → `presentCanonicalClinicalView('front')` / `presentClinicalCubeView('front')`
- After manual rotate, Home restores the same canonical anterior basis (within tolerance)

---

## BOTH / UPPER / LOWER

- Default on Orientation enter: **BOTH**
- BOTH fit: union of visible upper + lower oriented bounds
- UPPER / LOWER: same anterior direction; fit uses that arch’s visible bounds only
- Arch switch does not change the clinical coordinate system

---

## Real Dental Case

Fixtures: `apps/studio/public/clinical-fixtures/{upper,lower}.stl`

Flow: Create → Import → Orientation → Auto Orient

Estimator maps dual-arch bite axis to superior and tip gradient to anterior; transform maps superior→+Y, anterior→+Z. Upper clinical centroid remains above lower.

---

## Screenshot Evidence

Walkthrough: `docs/certification/prod-002sc-browser-walkthrough.mjs`  
Results: `docs/certification/prod-002sc-browser-walkthrough.json` — **overall PASS**

Directory: `docs/certification/prod-002sc-browser-shots/`

| File | Shows |
|------|--------|
| 01-auto-orient.png | Auto Orient → facial Ant, BOTH |
| 02-view-cube-anterior.png | View Cube Ant — same clinical direction |
| 03-home.png | Home — same canonical pose |
| 04-upper.png | UPPER-only fit, Ant direction |
| 05-lower.png | LOWER-only fit, Ant direction |
| 06-both.png | BOTH restored, Ant |

Primary comparison: **01** vs **02** — same anterior/facial direction (numerical bases equal; visuals match).

---

## Automated Tests

Vitest: `apps/studio/test/clinical/prod-002sc-canonical-anterior.test.ts`

| Id | Assertion | Result |
|----|-----------|--------|
| A | Auto Orient → closestFace `front` (Ant) | PASS |
| B | View Cube Ant ≡ Auto Orient basis | PASS |
| C | Home ≡ Auto Orient basis | PASS |
| D | Manual rotate → Home restores Ant | PASS |
| E | BOTH combined bounds for fit target | PASS |
| F | UPPER-only fit; direction unchanged | PASS |
| G | LOWER-only fit; direction unchanged | PASS |
| H | Re-run Auto Orient identical basis | PASS |

Also: `prod-002sc-fixture-axes.test.ts` (real STL axis/transform sanity), `auto-orientation.test.ts`, `orientation.test.ts`.

Playwright certification walkthrough: all steps PASS (including H-rerun).

---

## Remaining Observations

- LOWER-only anterior framing can show more of the mandibular occlusal table than the BOTH smile composition; camera basis remains Ant (`front`) and matches View Cube Ant numerically.
- Probe artifacts (`probe-*.png`) from earlier debugging may remain in the shots folder; certification evidence is `01`–`06`.
- Movement / clinical product certification not started.

---

## Validation

| Check | Result |
|-------|--------|
| typecheck | PASS |
| build | PASS |
| architecture tests | PASS |
| vitest (full studio suite; pre-cln011/012 updated for clinical-frame Ant) | PASS |
| Playwright `prod-002sc-browser-walkthrough.mjs` | PASS |

---

## Certification

**PASS**

Certifies only the demonstrated Auto Orient / View Cube Ant / Home / arch-fit camera presentation behavior on the real dual-arch fixtures. Does not claim broader clinical product certification. Does not start Movement.
