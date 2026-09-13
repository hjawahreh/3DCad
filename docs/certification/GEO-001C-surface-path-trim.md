# GEO-001C

## Root Cause

After GEO-001B exact welding, Trim no longer failed with disconnected-component
errors on real dental STLs. Remaining failures on curved clinical draws were in
**boundary path construction**:

1. Fixed / under-densified chords left the surface or triggered spacing jumps.
2. Self-intersection tests used screen XY or a single global Newell plane, which
   false-positived on densified curved loops.
3. Polyline gaps needed geodesic reconstruction; freehand needed gap-only
   reconstruction (not Dijkstra between every sample).
4. Close flipped a flag without validating a surface closing segment.
5. Preview re-ran geodesic between every densified sample (hang) and sent
   hundreds of loop points into VTK SelectPolyData (multi-minute clips).

Connectivity validation (`DISCONNECTED_PATH`) was **not** weakened.
Self-intersecting boundaries remain rejected by SurfacePath.

## Surface Path Model

Authoritative pipeline:

`Pointer samples → surface hits → SurfacePath → validated closed SurfacePath`

Derived `loop3d` for VTK is produced from SurfacePath samples only. Competing
screen/world polygon authorities are not used for clip decisions.

Key modules:

- `geometry-kernel/engine/SurfacePath.ts` — create / validate / close / simplify /
  thin / quality metrics / clinical messages
- `clinical/trim/ClinicalTrimSurfacePath.ts` — Trim ↔ SurfacePath bridge
- Trim overlay + `ClinicalMeshViewport` render mesh-local SurfacePath geometry

## Adaptive Sampling

`adaptiveSampleSpacingMm` derives spacing from local triangle edge length,
clamped (~0.2–1.25 mm) around a ~0.35 mm base. Freehand acceptance uses this
spacing when `faceId` is known. Dense meshes avoid thousands of redundant
points; coarse meshes keep contour fidelity.

## Geodesic Reconstruction

- **Polyline:** `reconstruct: 'already'` / `'always'` between anchors via face
  dual Dijkstra + on-surface densification.
- **Freehand:** `reconstruct: 'gaps'` only when spacing exceeds local threshold.
- **Post-Close densified paths:** `reconstruct: 'never'` so preview does not
  re-run O(n) Dijkstra.
- Failure to connect anchors surfaces: `Unable to connect these surface points.`

## Self-Intersection

Detection uses SurfacePath samples projected into a **local Newell / tangent
frame** (`countSelfIntersections`). Screen-space and planar loop3d checks are
no longer the authority for mesh-local loops. Exact duplicate / zero-length
repairs only; clinical crossings require user correction.

## Closure

`closeSurfacePath` builds a surface route from last → first when needed, then
validates the closed loop (self-intersection, spacing, component). UI Close
rewrites session points from the authoritative SurfacePath (then thinned for
VTK responsiveness).

## Trim Region Matching

`ClinicalTrimEngine` rejects:

- removed area too small vs path-length heuristic
- removed area grossly larger than enclosed region estimate

Fingerprint must change for a successful preview/accept.

## Real Dental Results

Same upper STL as GEO-001A/B (`apps/studio/public/clinical-fixtures/upper.stl`):

| Check | Result |
|---|---|
| Working components after weld | 1 |
| GEO-001A disconnected error | **Absent** |
| Polyline close (SurfacePath) | PASS (`components=1`) |
| Polyline VTK preview | PASS (~97 s on ~261k tri) |
| Freehand close + preview | PASS |
| Accept geometry change | PASS (`261287 → 259536` faces; fingerprint changed) |
| Undo / Redo | PASS |
| Lower trim | **PASS** (~95 s preview) |
| Save | PASS; reopen OBSERVE (dirty/openCase edge in headless) |

Unit regression on welded upper SurfacePath: **PASS** (no disconnected failure).

## Browser Evidence

Script: `docs/certification/geo-001c-browser-walkthrough.mjs`  
JSON: `docs/certification/geo-001c-browser-walkthrough.json`  
Shots: `docs/certification/geo-001c-browser-shots/`

Latest walkthrough summary: **11 PASS / 0 FAIL / 2 OBSERVE**

| Shot | Content |
|---|---|
| 01-surface-hover | Trim armed hover (cursor automation OBSERVE in headless) |
| 02-polyline-surface-path | ≥5 surface anchors / mesh-local path |
| 03-polyline-closed | Closed SurfacePath |
| 04-polyline-preview | VTK preview after polyline |
| 05-freehand-surface-path | Curved freehand samples |
| 06-freehand-preview | Freehand preview |
| 07-accepted | Accepted trim |
| 08-undo / 09-redo | History |
| 10-lower | Lower arch surface trim preview |

Critical shots **02 / 04 / 05 / 06** demonstrate surface-attached path + preview.

## Performance

Measured on real upper (~261k triangles, browser):

| Stage | Approx. |
|---|---:|
| SurfacePath close (polyline anchors) | ~20–30 s (includes geodesic densify) |
| VTK polyline preview | ~97 s |
| VTK freehand preview | ~57 s |
| Lower VTK preview | ~95 s |
| Pointer live validation | lightweight (no full region extract) |

Mitigations: gap-only freehand geodesic; no post-close geodesic rebuild;
`thinSurfacePath` (~1 mm / max 128 samples) before VTK.

## Tests

| Suite | Result |
|---|---|
| `geo-001c-surface-path-trim.test.ts` | 9/9 PASS (fixtures §26 + real upper) |
| `geo-001-clinical-geometry-engine.test.ts` | PASS |
| `geo-001b-topology-normalization.test.ts` | 12/12 PASS |
| `test/clinical/geometry` aggregate | **77/77 PASS** |
| `test/architecture.test.ts` | **4/4 PASS** |
| studio `typecheck` | **PASS** |
| Browser walkthrough | **11 PASS / 0 FAIL / 2 OBSERVE** |

Do not claim clinical certification. Close Base construction remains blocked.

## Remaining Observations

1. **Surface cursor in headless:** pointermove dispatch did not always populate
   `previewCursor` (OBSERVE). Interactive browser still shows green surface
   cursor via overlay + 3D sphere when picks hit.
2. **VTK preview latency** on full dental meshes remains multi-tens of seconds
   even after thinning — acceptable for certification but not interactive-tight.
3. **Save → reopen:** save succeeded; reopen remained OBSERVE under dirty-case
   constraints in the automated script.
4. Manual human-drawn convex / concave / freehand inspection remains recommended
   beyond Playwright injection.

## Certification

**PASS WITH OBSERVATIONS**

Satisfied:

1. Real normalized dental scan  
2. Surface path connected / on mesh  
3. Self-crossing rejected (unit + clinical message)  
4. Valid curved loops accepted (polyline + freehand)  
5. Closure along surface  
6. Preview corresponds to loop (geometry change on accept)  
7. Undo / redo  
8. Second trim / lower arch  
9. Upper/lower isolation (no GEO-001A disconnected failure)  
10. Persistence save exercised  

Observations: headless surface-cursor automation; VTK latency; reopen dirty-gate.

**Close Base remains blocked** until this SurfacePath + Trim path is trusted as
input to `ClinicalBaseEngine`.

**Do not start Movement.**
