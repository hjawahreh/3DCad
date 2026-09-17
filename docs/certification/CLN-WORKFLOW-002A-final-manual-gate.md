# CLN-WORKFLOW-002A FINAL MANUAL GATE

**Ticket:** Final manual-gate closure — real clinical behavior  
**Date:** 2026-09-17  
**Fixtures:** `apps/studio/public/clinical-fixtures/{upper,lower}.stl`  
**Walkthrough:** `docs/certification/cln-workflow-002a-final-manual-gate-walkthrough.mjs`  
**Evidence JSON:** `docs/certification/cln-workflow-002a-final-manual-gate-walkthrough.json`  
**Shots:** `docs/certification/cln-workflow-002a-final-manual-gate-shots/` (01–15)  
**Biomechanics / Movement:** not started (LOCKED)  
**Clinical validation claim:** none

## Import

Dual-arch import presents BOTH with canonical clinical anterior via `presentCanonicalClinicalView('front')`. Shot `01-import-both.png`. **PASS.**

## Clinical Orientation

Auto Orientation → BOTH → clinical anterior camera fit. Origin `auto`. Shared basis with Home / View Cube ANTERIOR. Shot `02-auto-orientation.png`. **PASS.**

Orbit mapping left unchanged after live probe (`yaw = −dx`, `pitch = −dy`):

| Gesture | Result |
|---------|--------|
| RIGHT | eye.x decreases |
| LEFT | eye.x increases |
| UP | eye.y increases |
| DOWN | eye.y decreases |

**PASS** — no sign change.

## Preparation

Accept Orientation → finalize → geometry warmup → automatic Trim UPPER (no technical Prepare page). Shot `03-prepared-trim-upper.png`. **PASS.**

## Trim Upper

One-arch isolation (UPPER only). Release-to-trim lasso:

| Op | before → after | faces |
|----|----------------|-------|
| Trim A | `geo:503132cd` → `geo:202e0bdd` | 257233 → 255844 |
| Trim B | `geo:202e0bdd` → `geo:a0cc1035` | 255844 → 246000 |

Shots: `04-upper-trim-drawing`, `05-upper-trim-result`, `06-upper-second-trim`. **PASS.**

## Trim Lower

LOWER only; upper fingerprint unchanged (`geo:a0cc1035`). Lower cut `geo:856046ee` → `geo:be8b517e` (233562 → 229304). Shot `07-lower-trim.png`. **PASS.**

## Clear / Redraw

Clear resets points; Trim stays active; status `Cleared — draw again, release to trim.` Repeated twice. **PASS.**

## Base Upper

Create Base auto-commits (no Accept). UI: `geo:a0cc1035` → `geo:4d95aed1` (246000 → 254140). Engine gate (`geo-001d` real upper): watertight / no slab / no bridge. Shot `08-upper-base.png`. **PASS.**

## Base Lower

Create Base via UI (`clicked:true`): `geo:be8b517e` → `geo:f2a13790` (229304 → 242277). No diagonal-bridge failure. Engine gate (`geo-001d` real lower) PASS. Shot `09-lower-base.png`. **PASS.**

**Fix applied this gate:** Base **Done** no longer re-invokes `accept()` / full geometry rebuild (that blocked Base→Segment for >60s). Done now cancels Base and enters Segmentation immediately.

## Segmentation Edit

Guided entry at EDIT (prepared model, no premature colored result). Shot `10-seg-edit.png`. **PASS.**

## Mark Teeth

Real surface picks via mesh picker → `pickToothAt`. 4 markers with `arch`, `faceIndex`, `geometryFingerprint` (`geo:4d95aed1`), world position. Shot `11-mark-teeth.png`. **PASS.**

Contract: markers are **session-live**; accepted `segmentationMeta` is what persists.

## Auto Segmentation

Guided Auto step reached. Provider reported: `reference-heuristic` (not labeled clinically validated). Shot `12-auto-segmentation.png`.

**OBSERVE:** walkthrough snapshot caught `phase=preparing`, `instanceCount=0` — wait loop exited before full reference completion on this run. Production model honesty path remains (no silent “clinically validated” claim).

## Adjust Boundaries

Guided step entered; review UI available. Shot `13-adjust-boundaries.png`. **PASS** (domain tools only where APIs exist — no fabricated correctors).

## Verify Teeth

Verify step + NEXT disabled (`clinical-seg-next-biomech` locked). Shot `14-verify-teeth.png`. **PASS.**

## Save/Reopen

Save → close → open same `caseId`. Fingerprints preserved (`upper geo:4d95aed1`, `lower geo:f2a13790`). Guide step restored to `verify-teeth`; segmentation toolbar present. Shot `15-reopened-final.png`. **PASS.**

## Camera

| Stage | Presentation |
|-------|--------------|
| Import / Orient | BOTH, canonical anterior, fit |
| Trim / Base | active arch only, fit |
| Segmentation | BOTH / review, anterior |

Shared basis: Auto Orientation / Home / View Cube ANTERIOR. **PASS.**

## View Cube

Compact CSS 3D cube with labels: ANTERIOR, POSTERIOR, LEFT, RIGHT, OCCLUSAL, LOWER + Home. Uses Camera Runtime only. XYZ axes/gizmo off in clinical mode (`06b-no-xyz` PASS). **PASS.**

## Performance

Browser walkthrough wall time ≈ **15.7 min** (940s). Upper/lower base engine ≈ 10s each on fixtures (`geo-001d`). GeometryWarmup + VTK :8765 used; no Trim/Base warm regression observed.

## Automated Evidence

| Gate | Result |
|------|--------|
| typecheck (`apps/studio` tsc) | **PASS** (exit 0) |
| build (`apps/studio`) | **PASS** (exit 0) |
| vitest focused clinical (6 files) | **52 passed / 0 failed** |
| — `geo-001d` real upper/lower base | PASS |
| — `geo-003a` viewport navigation | PASS |
| — `cln-trim-002` | PASS |
| — `cln-workstation-001` | PASS |
| — `view-cube` | PASS |
| — `cln-seg-001-production-gate` | PASS |
| Playwright final manual gate | **27 PASS / 0 FAIL** |

## Manual Evidence

All required screenshots present:

`01-import-both` … `15-reopened-final` under `cln-workflow-002a-final-manual-gate-shots/`.

## Failed Attempts

1. First final-gate walkthrough **FAIL** at Base→Segment: Done re-ran `accept()` geometry and timed out waiting for `clinical-segmentation-toolbar`. Fixed in `ClinicalCloseBaseToolbar.finishBaseStage`.
2. Small-radius freehand loops can self-intersect; successful Trim uses larger peripheral neighborhood (documented in attempt logs). Not a product hard-fail when a valid larger loop succeeds.

## Remaining Issues

- Auto-seg headless wait may undershoot full reference completion (see OBSERVE above).
- Production segmentation checkpoint may remain unconfigured → REFERENCE / BETA labeling only.
- Mark Teeth markers are session-live (by contract); reopen restores stage + geometry + accepted segmentation meta, not temporary markers.
- Biomechanics remains LOCKED (by design).
- Older accept-centric trim unit tests outside the focused suite may still expect pre-release-to-trim UX.

## Certification

**PASS WITH OBSERVATIONS**

Mandatory geometry/runtime gates closed on a real dental fixture path: clinical import/orient, release-to-trim (multi-op), clear/redraw, upper/lower clinical base, guided segmentation entry, Mark Teeth surface binding, save/reopen fingerprint continuity, camera/cube consistency, no clinical XYZ axes.

Observations do not override mandatory PASS criteria; they document auto-seg timing honesty and non-production provider labeling. No clinical accuracy claim. Biomechanics not started.
