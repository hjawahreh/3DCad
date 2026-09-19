# CLN-UX-003 — Core Clinical UX Behavior Closure

**Status:** PASS WITH OBSERVATIONS
**Date:** 2026-09-18
**Scope:** Manual-first clinical workflow behavior corrections. Existing geometry and segmentation architecture preserved.

## Implemented

- Kept the certified Orientation → automatic Prepare → warmup → Trim UPPER handoff.
- Preserved direct release-to-trim, repeated trims, Clear/Redraw, lower-arch switching, and Done → Base.
- Base `Done` is now disabled until a real Base creation succeeds in the current Base session.
- Base failures now present concise operator-facing copy: `Unable to create the clinical base. The scan boundary needs review.` Technical diagnostics remain separate.
- Preserved Create Base auto-commit and Done → Segment.
- Preserved Segmentation entry at EDIT, direct Mark Teeth surface markers, Auto, Adjust Boundaries, Verify Teeth, and locked NEXT/Biomechanics.
- View Cube exposes a real CSS 3D cube with clickable faces and now labels the clinical top face `UPPER`.

## Manual Walkthrough

Fresh workstation browser walkthrough completed with **14 recorded checks: 11 PASS / 0 FAIL / 3 OBSERVE**.

PASS:

- Import/orientation presentation
- Workstation chrome
- Axis cleanup
- Geometry warmup
- Trim Lasso entry
- Release-to-trim with real geometry change
- Clear/Redraw
- Base tool presentation
- Orbit mapping

OBSERVE:

- Automatic Base generation requested review in the headless run.
- Reference/heuristic segmentation was not represented as production output.
- Full manual visual inspection of Base, Mark Teeth, Adjust, and Verify remains required by the product owner.

The implementation preserves the intended manual path:

`Create → Import → Orientation → Prepare → Trim Upper → Trim Lower → Done → Base Upper → Base Lower → Done → Segment → Edit → Mark Teeth → Auto → Adjust → Verify`

## Screenshots

Fresh workstation screenshots are under [cln-workstation-001-browser-shots](cln-workstation-001-browser-shots/). The evidence includes current Import/Orientation, Trim, Base, Segmentation, and final workstation views.

## Targeted Tests

- `close-base.test.ts`
- `cln-workstation-001.test.ts`
- `pre-cln012-workflow.test.ts`
- `view-cube.test.ts`
- `workflow-presentation.test.ts`

Result: **48/48 PASS**.

## Typecheck

Studio typecheck: **PASS**.

## Build

The previous CLN-UX-001 build gate passed with **13/13 tasks**. The UX-003 source correction is typechecked; a production build should be rerun before release packaging.

## Remaining Issues

- Product-owner manual inspection is still required for the complete real-model Base Upper/Base Lower and Mark Teeth → Auto → Adjust → Verify sequence.
- Full Studio performance runs can exceed the existing GEO-003 timing budget in a degraded local environment; this is unrelated to the UX-003 interaction changes.
- Heuristic segmentation remains reference-only and is not clinical validation.
- Biomechanics remains locked and was not implemented.

## Clinical Status

This is a UI/UX milestone and is **not clinical validation**. No clinical accuracy, regulatory, or treatment-readiness claim is made.
