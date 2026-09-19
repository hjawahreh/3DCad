# CLN-UX-002 — Clinical Workstation UX Correction / Manual-First Acceptance

**Status:** PASS WITH OBSERVATIONS
**Date:** 2026-09-18
**Scope:** Manual-first clinical workstation interaction corrections. Geometry, segmentation architecture, and production model boundaries were preserved.

## Implemented

- Preserved the existing automatic Orientation → Prepare → warmup → Trim UPPER handoff.
- Preserved direct release-to-trim, unlimited sequential trims, Clear/Redraw, one-arch isolation, and Done → Base behavior.
- Preserved Create Base auto-commit and Done → Segment behavior without a second Accept Base step.
- Preserved direct Mark Teeth surface markers, Auto Segmentation lifecycle, Adjust Boundaries, Verify Teeth, and locked NEXT/Biomechanics.
- Corrected the professional View Cube upper face label from `OCCLUSAL` to `UPPER`; the cube remains a real clickable 3D navigation instrument using Camera Runtime.
- Kept the UX-001 viewport-first shell, compact rail, workflow strip, arch control, and contextual toolbars.

## Manual QA

The fresh workstation walkthrough completed **14 recorded checks: 11 PASS / 0 FAIL / 3 OBSERVE**.

PASS checks included:

- clinical Orientation presentation
- clean home / workstation chrome
- axis cleanup
- geometry warmup
- Trim Lasso entry
- direct release-to-cut with real face reduction
- Clear/Redraw
- Base tool presentation
- orbit mapping

Observations:

- Automatic Base generation requested review in the headless run; this is surfaced as a genuine review state, not converted to success.
- Reference/heuristic segmentation remains explicitly non-production; the headless run did not claim clinical output.

The full human smoke path remains the acceptance path for confirming visual Base inspection and segmentation review:

`Create → Import → Orient → Prepare → Trim Upper → Trim Lower → Done → Base Upper → Base Lower → Done → Segment → Edit → Mark Teeth → Auto → Adjust → Verify`

## Automated Checks

- Focused UX/workstation/View Cube/workflow tests: **24/24 PASS**
- Studio typecheck: **PASS**
- CLN-SEG-002E geometry certification remains the baseline for Base integrity.

A full Studio suite rerun was attempted after the UI changes. The existing GEO-003 warmup performance gate exceeded its fixed local timing budget under the available environment; no UI assertion or clinical geometry correctness failure was introduced.

## Screenshots

Fresh workstation evidence is stored under [cln-workstation-001-browser-shots](cln-workstation-001-browser-shots/). It includes Import/Orientation, Trim, Base, Segmentation, and final workstation views captured after the UX shell refinement.

## Known Remaining Issues

- Full manual human inspection is still required for visual Base quality and complete Mark Teeth → Auto → Adjust → Verify acceptance.
- Headless geometry timing is unstable for GEO-003; this is an environment/performance observation, not a UI behavior claim.
- Heuristic segmentation remains reference-only and is not clinical validation.
- Biomechanics remains locked and was not implemented.

## Clinical Status

This is a workstation UX milestone and is **not clinical validation**. It makes no claim of clinical accuracy, regulatory approval, or treatment readiness.
