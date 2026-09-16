# CLN-TRIM-002

Professional clinical viewport + Trim V4.

**Automated unit tests: PASS**  
**Browser walkthrough: run `cln-trim-002-browser-walkthrough.mjs`**  
**Manual browser verification: REQUIRED for PASS**

Do not start Movement. Do not start Segmentation testing until this milestone passes.

## Current Defects

Manual findings addressed in this milestone:

1. Auto Orientation presentation / anterior camera path
2. Bottom-corner XYZ orientation gizmo in clinical mode
3. XYZ axis lines over the dental scan
4. Mouse orbit direction
5. Freehand Trim usability / real cut
6. Polyline Trim reliability
7. Clear → redraw failure

## Root Causes

| Defect | Root cause |
| --- | --- |
| XYZ axes / gizmo | CSS overlay helpers + Orientation overlay guides; stale `localStorage` `display.v2` prefs could re-enable axes |
| Orbit inverted | Screen→orbit sign in `camera-orbit-mapping.ts` (single site); flipped once for grab-model clinical feel |
| Clear → redraw | Preview/op/pointer state not fully reset; hardened Clear + tool-switch reset |
| Fake “Boundary valid” | Toolbar inferred validity from `pointCount >= 3`; now UI derives from interaction state + real preview delta |
| Accept without cut | Accept auto-previewed; now Accept requires `canAcceptTrim()` (real preview + meaningful face/fingerprint delta) |
| Overloaded toolbar | 13+ actions; replaced with slim V4 groups |

## Trim Interaction

Explicit states: `EMPTY → ARMED → DRAWING → CLOSED → PREVIEWING → PREVIEW_READY → COMMITTING → COMMITTED | ERROR`.

UI (toolbar, overlay, left guide) derives from these states — not from point count alone.

## Surface Cursor

Green surface cursor on live mesh hit only. Hidden on miss (never sticky last-hit). Drawing requires a surface hit.

## Freehand

Arm via toolbar → drag-first gesture (pointer down starts, move appends, up ends). Adaptive surface spacing retained. 3D SurfacePath line remains the authoritative viewport stroke (`ClinicalMeshViewport`).

## Polyline

Click-to-point only. Missed raycasts do not add points. Segments use geodesic surface connection (`tryConnectPolylineAnchors`).

## Closure

Approach first point → highlight + “Close Trim”. Click first point closes along surface. Explicit Close button remains secondary.

## Preview

Preview invokes ClinicalGeometryEngine / VTK worker. Orange loop alone is not preview. Preview rejected unless fingerprint changes and face delta is meaningful (≥50 removed or ≥100 remesh delta) and quality validation passes.

## Commit

GEO-001E: Accept promotes exact preview mesh — no recompute. Accept disabled until real preview ready.

## Clear / Redraw

Hard reset: points, path, preview, validation, operation, pointer capture, worker preview ids, fingerprints. Tool stays ACTIVE/armed for immediate redraw without reload. Tool switch Freehand↔Polyline also hard-resets.

## Camera

Orbit mapping (`screenDeltaToOrbitRadians`) applied once in composition-root. Zoom/pan/View Cube/Home unchanged paths.

## View Cube

Only orientation navigation control in clinical mode. Labels: ANT / POST / LEFT / RIGHT / TOP / BOTTOM. Home ≡ Anterior. Auto Orient / Home / Ant share `presentCanonicalClinicalView`.

## Axis Cleanup

- Display prefs storage key `v3`; clinical mode forces axes/origin/orientation-indicator **off**
- Viewport overlay mounts helpers only when prefs enable them
- Orientation overlay: removed always-on XYZ guides/labels over the scan
- Developer: Frame Stats shows trim preview diagnostics

## Real Dental Manual Test

Use upper peripheral / labial–posterior excess region with a moderate loop (not a tiny tip triangle). Operator must see: “I drew here” → “That exact area disappeared.”

## Browser Evidence

Script: `docs/certification/cln-trim-002-browser-walkthrough.mjs`  
Shots: `docs/certification/cln-trim-002-browser-shots/` (01–15)  
JSON: `docs/certification/cln-trim-002-browser-walkthrough.json`

Playwright run (2026-09-15):

| Step | Result |
| --- | --- |
| Orientation / anterior | PASS |
| Axis cleanup (no XYZ) | PASS |
| Warmup READY | PASS |
| Freehand arm + draw + close | PASS |
| Real preview | PASS — faces **261287 → 255922** (−5365), FP `geo:c828c055` → `geo:63308263` |
| Accept | PASS — same face delta |
| Clear → redraw | PASS |
| Polyline preview + cancel | PASS |
| View Cube Ant | PASS |
| Orbit mapping | PASS |

Critical shots: `06-freehand-real-preview.png`, `07-freehand-accepted.png` show a meaningful peripheral cut.

## Automated Tests

- `test/clinical/trim/cln-trim-002-professional-trim.test.ts` (11)
- Updated `prod-002sb-trim-interaction.test.ts`, `geo-003a-viewport-navigation.test.ts`

## Performance

No intentional Trim algorithm redesign. Warmup gate retained. Preview still worker-backed. Browser preview/accept on dental upper ~seconds (VTK).

## Remaining Problems

- Manual operator confirmation of orbit direction / anterior presentation still required for full PASS
- Full-arch freehand loops can self-intersect (validation correctly blocks); use moderate peripheral patches
- Meaningful-delta thresholds (50/100 faces) are engineering gates, not clinical tolerances

## Certification

**PASS WITH OBSERVATIONS**

Automated Playwright evidence shows a real cut, clean axes, Clear/redraw, View Cube, and orbit mapping. Full **PASS** still requires the operator’s manual browser verification of orbit feel and clinical anterior presentation.

Movement: **not started**. Segmentation testing: **blocked** until operator confirms PASS.
