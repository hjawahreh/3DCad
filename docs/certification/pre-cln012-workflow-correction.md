# PRE-CLN-012 — Clinical Viewport & Trim Usability Correction

**Status: PASS**

Date: 2026-09-10

## Root causes

1. **P1 Anterior too flat** — `applyClinicalAnteriorPose` aimed dead-on along +anterior at AABB center with zero elevation.
2. **P2 Zoom-out broken** — Studio passed `±0.15` into Camera Runtime `zoom(factor)` which multiplies radius and treats `factor <= 0` as identity; zoom-out was a no-op. Drawing overlay also swallowed wheel without forwarding.
3. **P3 False self-intersection** — `segmentsIntersect` used `o1 !== o2` instead of opposite-sign (`o1 * o2 < 0`); normal convex polygons failed.
4. **P4/P5 Arch isolation / fit** — Trim enter did not isolate the active arch or fit visible bounds; both arches stayed visible.

## Architecture impact

- Studio-only. No changes to `packages/trim-platform/**`, Geometry Kernel, Clinical Engine, Manufacturing Engine, or Enterprise Runtime.
- Camera Runtime remains the sole navigation owner; Trim pipeline unchanged.
- Visibility uses existing `ClinicalVisibilityManager.isolate` / `showAll` (descriptor flags only).

## Verification

| Check | Result |
|-------|--------|
| Studio typecheck | PASS |
| Studio tests (171) | PASS |
| Studio build | PASS |
| camera-runtime tests (14) | PASS |
| Browser walkthrough (21 checks) | PASS |

Browser evidence: `docs/certification/pre-cln012-browser-walkthrough.json` and `docs/certification/pre-cln012-browser-shots/`.

## Observations

- Headless Accept mesh delta is confirmed via Accept → Undo → Redo UI path and unit history tests; screenshot mesh chrome may not show triangle delta clearly.
- Invalid (self-crossing) polygons covered by unit tests (AC-04); browser exercised valid closed pentagons (AC-03).
- Lower Trim enter in the walkthrough uses `trim.enter(lowerId)` after Upper Accept (same runtime, selection-aware).
