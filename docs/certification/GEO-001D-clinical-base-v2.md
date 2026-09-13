# GEO-001D Clinical Base V2

## Current Failure

Previous Close Base produced visibly unacceptable geometry: rectangular AABB slabs, diagonal cross-arch bridges, giant triangles, malformed side walls, and base perimeters unrelated to the dental border.

GEO-001D replaces that construction. AABB / viewport / arbitrary world-plane perimeters are **not** authoritative. The previous slab path must not be treated as production geometry.

## Boundary Source

Authoritative input is the **current working mesh** (post-Trim when Accept mutates; otherwise the open clinical scan rim on working geometry).

Pipeline:

`working mesh → boundary loops → clinical boundary selection → base plane → floor triangulation → side walls → thickness plate (optional) → BaseQualityReport → preview → accept`

Preferred border: open topology loops on the working mesh. Construction does **not** invent a second unrelated perimeter.

## Boundary Extraction

`extractBoundaryLoops` + `analyzeBoundaryLoop` / `selectClinicalBaseBoundary`:

- point count, perimeter, enclosed area, centroid, bounds
- average normal, plane-fit residual / max / mean / p95 distances
- score prefers clinically oriented, non-artifact loops (not automatic largest/smallest/AABB)

Cleaning: exact-duplicate collapse, zero-length edge removal, order preserved. Aggressive stride subsample is forbidden for walls (it chorded arches into AABB-like shortcuts). Default max samples **8192**.

## Base Plane

Plane normal starts from the boundary Newell fit. Clinical frame normal is applied **only when aligned** (|dot| > 0.35). Orthogonal clinical axes no longer collapse the rim into a degenerate line.

Extrusion is inferior along the selected normal: `minProj − height`.

## Triangulation

Primary: **centroid fan in UV** when the UV centroid lies inside the polygon (no non-adjacent boundary diagonals).

Fallback: in-repo ear-clip in UV (no new triangulation library).

Holes: nested holes are not silently filled; unsafe hole sets fail with diagnostics.

## Side Walls

Strict correspondence `top[i] → bottom[i]` with preserved order. Bottom points are clinical-boundary vertices moved along the base normal (not an AABB rectangle).

## Thickness

Parameters `height`, `thickness`, `offset` drive extrusion / optional inferior plate. When a thickness plate is present, the intermediate bottom ring is **not** filled (only the plate floor) so edges stay manifold.

Thickness stats: min / max / mean wall length.

## Quality Validation

`BaseQualityReport` includes fingerprints, boundary metrics, planarity, thickness, topology counts, watertight/manifold flags, boundary match, slab detection, diagonal-bridge detection, stage timings, `blockingFailures`.

Blocking failures reject construction (`ok: false`). Close Base handler also gates on `baseV2:*` / `meta:base*` diagnostics.

## Slab Detection

Rejects when generated perimeter ≈ AABB **while** the clinical planar border does not.

## Diagonal Bridge Detection

Flags long original-vertex faces spanning a large fraction of arch width near the centroid. Rejects above count/ratio thresholds.

## Real Dental Results

Fixtures: `apps/studio/public/clinical-fixtures/upper.stl`, `lower.stl`.

| Check | Result |
| --- | --- |
| Boundary selection upper/lower | PASS |
| Real upper `constructClinicalBase` | PASS — no slab, no bridge, boundary match, watertight |
| Browser Auto Base Preview | PASS — `faceCount` 261287 → 272652; `boundaryEdges=0`; `nonManifold=0`; components=1 |
| Browser Accept / Undo / Redo / Save / Reopen | PASS |

## Performance

| Stage | Measured (browser walkthrough) |
| --- | --- |
| Trim preview (VTK) | ~100681 ms (dominant; GEO-001C-class VTK latency) |
| Close Base preview 1 | ~12589 ms |
| Close Base preview 2 | ~15216 ms |
| Engine validation on large meshes | Typically dominant vs triangulation/walls |

Production Close Base uses reference **clinical-base-v2** (Hybrid no longer routes Close Base through VTK AABB `close_base`).

## Browser Evidence

- Walkthrough: `docs/certification/geo-001d-browser-walkthrough.mjs`
- JSON: `docs/certification/geo-001d-browser-walkthrough.json`
- Shots: `docs/certification/geo-001d-browser-shots/` (`01`–`11`)

**Walkthrough summary: 13 PASS / 0 FAIL / 1 OBSERVE**

| Step | Status |
| --- | --- |
| Create / Import / Auto Orientation | PASS |
| Trim preview | PASS (~101 s VTK) |
| Trim Accept mutation | OBSERVE — Accept did not change fingerprint; open clinical rim already present (2273 verts, ~350 mm perimeter) |
| Auto Create Base → Preview (×2) | PASS |
| Preview views Ant/Post/L/R/Occlusal/Bottom | PASS |
| Cancel restore | PASS |
| Accept / Undo / Redo | PASS |
| Save / Reopen | PASS |

Conceptual CSS AABB slab overlay removed from `ClinicalCloseBaseOverlay` so preview chrome does not impersonate geometry. Badge still reports `live mesh` when a kernel fingerprint is present.

Anterior / multi-view screenshots: no diagonal bridge; no giant cross-arch faces; mesh growth + watertight metrics confirm boundary-driven closure. Base surface shares clinical gray shading (visual contrast limited — observation only).

## Automated Tests

| Suite | Result |
| --- | --- |
| typecheck (`tsc -b`) | PASS |
| build (`tsc -b && vite build`) | PASS |
| `test/architecture.test.ts` | **4 passed** |
| `geo-001d-clinical-base-v2.test.ts` | **12 passed** |
| `close-base.test.ts` | **23 passed** |
| `auto-close-base.test.ts` | **8 passed** |
| Combined GEO-001D core (5 files incl. geometry-kernel + clinical engine) | **66 passed** |

Playwright certification: dedicated `geo-001d-browser-walkthrough.mjs` (above). Full Studio Playwright regression suite was not re-executed beyond this walkthrough.

## Remaining Observations

1. Trim Accept on the polyline hull was a no-op for fingerprint; Close Base still consumed the existing open scan rim (trustworthy boundary). Prefer a tighter GEO-001C-style trim when certifying Trim→Base mutation in the same run.
2. Default UI orientation `xz` may be poorly aligned to Z-up synthetics; construction falls back to the boundary plane when clinical normal alignment is weak.
3. Preview mesh color does not strongly distinguish base floor from dental shell in screenshots.
4. VTK trim preview remains ~1 minute on full dental meshes — documented, not fabricated progress %.

## Certification

**ENGINE PASS**

**REAL-DENTAL PASS**

**BROWSER PASS** (with Trim Accept OBSERVE)

**CLINICAL CERTIFICATION — NOT claimed**

### Overall

**PASS WITH OBSERVATIONS**
