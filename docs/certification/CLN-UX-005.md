# CLN-UX-005 — Visual Convergence Loop

**Status:** PASS WITH OBSERVATIONS
**Date:** 2026-09-18
**Scope:** Screenshot-driven workstation hierarchy and interaction convergence. No geometry or segmentation architecture changes.

## Product Changes

- Reduced workflow duplication: the global workflow strip owns stage navigation; the left rail now communicates the current tool and future locked tools instead of repeating every stage-entry action.
- Preserved the viewport-first shell and compact contextual toolbars.
- Fixed the View Cube hit-testing defect where transformed CSS-3D faces could intercept clicks intended for UPPER/LOWER or side faces. A stage-level screen-region router now preserves real face navigation while keeping the cube visually 3D.
- Preserved the existing direct Trim, Base, Mark Teeth, Auto, Adjust, and Verify behavior.

## Visual Iterations

Two fresh screenshot iterations were captured from the running Studio:

- `iteration-01`: landing, import, orientation, initial Trim.
- `iteration-02`: Trim hierarchy, cube front, cube upper, cube lower.

Evidence directory: [cln-ux-005-browser-shots](cln-ux-005-browser-shots/)

## Manual Workflow

Fresh live reproduction confirmed:

- Import presents both arches with clinical ANTERIOR/Home controls.
- Accept Orientation automatically runs preparation and warmup.
- The app arrives at Trim UPPER with only UPPER visible.
- The Trim toolbar exposes direct Lasso release-to-cut, Clear, LOWER, and Done.
- The View Cube lower face is clickable in the actual browser and changes the camera snapshot.

The full real-model Base and Segmentation sequence remains covered by the certified CLN-WORKFLOW-002A/CLN-SEG-002E evidence; this task did not fabricate a new Base or segmentation result.

## Targeted Validation

- Workstation/Trim tests: PASS.
- View Cube tests: **6/6 PASS**.
- Workflow presentation tests: PASS.
- Studio typecheck: PASS.
- Studio build: PASS.

## Remaining Issues

- Manual visual inspection is still required for the full Base Upper/Base Lower and Segment → Mark Teeth → Auto → Adjust → Verify sequence.
- Reference/heuristic segmentation remains non-production and not clinically validated.
- Full-suite geometry timing can exceed the existing GEO-003 performance threshold in degraded local environments.
- Biomechanics remains locked.

## Clinical Status

This is a UI/UX milestone and is not clinical validation.
