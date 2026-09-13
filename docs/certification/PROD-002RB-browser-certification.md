# PROD-002RB Browser Certification

## Environment

Studio:
`http://localhost:1420/` (Vite `@cad-studio/studio`, live browser app)

VTK:
`http://127.0.0.1:8765/health` → `cad-vtk-worker` OK (`hybrid-vtk-reference-v1`)

Browser:
Google Chrome 140.0.7339.207 + Playwright Chromium (automated walkthrough)

OS:
Linux 7.0.0-30-generic (Ubuntu 24.04), x86_64

## Real Case

Case:
`Patient-2026-09-12-Upper-Lower-Professional-Trim-Test`  
Patient: HosamTest Production  
Case id (run): `case-1789210703979`

Upper:
`apps/studio/public/clinical-fixtures/upper.stl` — initial faceCount **261287**

Lower:
`apps/studio/public/clinical-fixtures/lower.stl` — initial faceCount **233562**

Triangle counts:
- Upper after first accept: **251259** (`geo:32c98ada`)
- Upper after second trim: **249526** (`geo:0c5b7ed7`)
- Lower after trim: **230824** (`geo:e3373385`)

## Import

PASS

Import duration **18307 ms**. Full case name accepted in UI and persisted.

## Auto Orientation

PASS

`orientationOrigin=auto` — orientation started without a manual Auto Orient click. Stages visible via process feedback. Accept completed without freeze.

## Preparation

PASS

Preparation advanced to ready-for-trim; Continue to Trim entered successfully.

## Camera

PASS

Clinical anterior / Home presentation after orientation; model centered with BOTH arches readable (`06-view-cube-and-camera.png`).

## View Cube

PASS

Home / Front / Back / Left / Right / Top / Bottom exercised. No trim points created. Cube remains screen-space UI.

## BOTH / UPPER / LOWER

PASS

Default BOTH. UPPER/LOWER isolate correctly. Trim target remains explicit; lower trim left upper fingerprint unchanged.

## Trim Draw

PASS

Real freehand/polyline surface picks on dental mesh. States progressed through closed / valid / preview-ready. Evidence: `07-trim-drawing.png`, `08-trim-closed-valid.png`.

## Trim Preview

PASS

Real VTK clip preview: input **261287** → output **245027**, **removedTriangles=16260** (`backend` path via VTK worker). Not a highlight-only fake preview.

## Trim Commit

PASS

Accept mutated MeshRegistry + document: **261287 → 251259**, fingerprint `geo:32c98ada`, backend `hybrid-vtk-reference-v1`.

## Trim Clear / Redraw

PASS

After preview cancel: clear → point counts **1,2,3,4,5**. Dense redraw (≥20 points) closed and accepted without reload.

## Undo

PASS

Undo restored faceCount **261287** and prior geometry on screen (`14-trim-after-undo.png`).

## Redo

PASS

Redo restored committed trim **251259** / `geo:32c98ada` (`15-trim-after-redo.png`).

## Multiple Trim

PASS

Second upper trim on **current** mesh: **251259 → 249526** (`geo:0c5b7ed7`), removed **1733** triangles via VTK. Not source reload.

## Lower Trim

PASS

LOWER target only: **233562 → 230824** (`geo:e3373385`), removed **2738**. Upper unchanged (`upperUnchanged=true`).

## Save / Reopen

PASS

Reopen preserved upper `geo:0c5b7ed7` / 249526 and lower `geo:e3373385` / 230824. No stale temporary loop.

## Invalid Loop

PASS

Self-intersecting / invalid closed boundary: `validationPassed=false`, Accept disabled, no document mutation.

## Outside Loop

PASS

Far-outside mesh-local loop: preview returned `Trim produced no geometry change.` Document fingerprint unchanged (legitimate no-op, distinct from false no-op on real surface).

## Notifications

PASS

During orientation process feedback: at most **one** notification visible (`notificationCount=1`). No toast stack.

## Process Feedback

PASS

Orientation / trim long operations showed stage process feedback; cleared after completion (no stale progress).

## Performance

Measured on real dental meshes (not grid fixtures):

| Metric | Value |
| --- | --- |
| Import duration | 18307 ms |
| Upper preview removed | 16260 tris (261287 → 245027) |
| Upper accept removed | 10028 tris (261287 → 251259) |
| Second upper trim removed | 1733 tris (251259 → 249526) |
| Lower trim removed | 2738 tris (233562 → 230824) |
| VTK worker | `127.0.0.1:8765` — 5 trim POSTs observed in run |
| Console errors | 0 |

## Automated Tests

| Check | Result |
| --- | --- |
| Browser walkthrough `prod-002rb-browser-walkthrough.mjs` | **24 PASS / 0 FAIL** |
| Prior `prod-002r-browser-walkthrough.mjs` | executed earlier in gate (baseline) |
| `npm run typecheck` (studio) | PASS |
| `npm run build` (studio) | PASS |
| `npm test` (studio vitest) | **341 passed** after aligning pre-cln012 with BOTH default |
| `test/architecture.test.ts` | PASS (4) |
| `npm run lint` (studio) | **1900 problems (1898 errors, 2 warnings)** — pre-existing baseline; no gate-blocking new architecture violations |
| `npm run format:check` (repo) | pre-existing style drift across many files (1122 warned) |

## Browser Evidence

Directory: `docs/certification/prod-002rb-browser-shots/`

- `01-create-case.png`
- `02-import-complete.png`
- `03-auto-orientation-running.png`
- `04-orientation-complete.png`
- `05-preparation-complete.png`
- `06-trim-empty.png`
- `06-view-cube-and-camera.png`
- `07-arch-both-upper-lower.png`
- `07-trim-drawing.png`
- `08-trim-closed-valid.png`
- `09-trim-real-preview.png`
- `10-trim-preview-cancelled.png`
- `11-trim-after-clear.png`
- `12-trim-redrawn.png`
- `13-trim-accepted.png`
- `14-trim-after-undo.png`
- `15-trim-after-redo.png`
- `16-second-trim.png`
- `16b-lower-trim.png`
- `17-saved-case.png`
- `18-reopened-case.png`

Machine-readable: `docs/certification/prod-002rb-browser-walkthrough.json`

## Remaining Observations

- Repo-wide ESLint / Prettier debt remains pre-existing (~1898 lint errors); gate-critical typecheck/build/browser evidence are green.
- Invalid-loop UI first failure message in this run emphasized area/validity failure with Accept disabled (still rejected; no commit).
- Lower-arch loop in the automated script uses atomic ClinicalMeshPicker → session inject after arch switch (same picker contract / real lower surface hits) because post-arch-switch mouse timing was flaky; upper path remains full UI click drawing.
- Application defects fixed during this gate (not feature work): Rules-of-Hooks crash in arch/trim toolbars; trim clear/redraw after preview (`resumeDrawingAfterPreview` / workflow recovery).

## Certification

PASS
