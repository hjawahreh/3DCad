# CLN-UX-004 — Actual Product Fix: Clinical CAD Workstation Behavior

**Status:** PASS WITH OBSERVATIONS
**Date:** 2026-09-18
**Scope:** Concrete workstation behavior correction. Existing geometry, camera runtime, and segmentation architecture preserved.

## Product Fixes

- Import success presentation now keeps validation warnings collapsed by default so the imported clinical viewport remains inspectable immediately.
- Scan warnings remain available through an expandable `Review scan notes` region.
- Existing automatic Orientation -> Prepare -> warmup -> Trim UPPER handoff was manually reproduced against the running Studio.
- Existing manual-first Trim behavior remains active: UPPER-only entry, release-to-trim, Clear/Redraw, lower arch switching, and Done -> Base.
- Base Done remains gated until Create Base succeeds; Base failures use concise operator-facing messaging.
- Existing Edit -> Mark Teeth -> Auto -> Adjust -> Verify workflow remains intact, with reference segmentation explicitly labeled and NEXT/Biomechanics locked.
- View Cube remains a real CSS 3D navigation cube with clickable clinical faces: ANTERIOR, POSTERIOR, LEFT, RIGHT, UPPER, LOWER, plus Home.

## Manual Verification

Fresh live browser reproduction used the real Studio and VTK worker:

- Create Case with real upper/lower STL fixtures: PASS.
- Imported viewport present immediately with both arches and clinical ANTERIOR/Home controls: PASS.
- Auto Orientation entered and ran automatically: PASS.
- Accept Orientation showed preparation feedback and automatically arrived at Trim UPPER after warmup: PASS.
- Trim opened with UPPER isolated and direct Lasso/Clear/Done controls: PASS.

The complete real-model Trim -> Base -> Segment -> Mark Teeth -> Auto -> Adjust -> Verify sequence remains covered by the previously certified CLN-WORKFLOW-002A manual gate. The current UX-004 headless session was not used to fabricate new Base or segmentation PASS evidence.

## Targeted Tests

- Close Base, workstation, Trim isolation, View Cube, workflow presentation, and Orientation tests: **48/48 PASS**.

## Typecheck

Studio typecheck: **PASS**.

## Build

Studio production build: **PASS**.

## Screenshots

Current workstation screenshots remain under [cln-workstation-001-browser-shots](cln-workstation-001-browser-shots/). The fresh live import/orientation reproduction was inspected directly during this task. Existing CLN-WORKFLOW-002A real-model evidence remains the authoritative full clinical interaction record.

## Remaining Issues

- Full product-owner manual inspection is still required for Base visual output and the complete Mark Teeth -> Auto -> Adjust -> Verify path in the current running session.
- Heuristic segmentation remains reference-only and is not clinical validation.
- Full-suite GEO-003 timing can exceed its fixed local performance budget under degraded environments; unrelated to this UI correction.
- Biomechanics remains locked and was not implemented.

## Clinical Status

This is a workstation behavior milestone and is **not clinical validation**. No clinical accuracy, regulatory, or treatment-readiness claim is made.
