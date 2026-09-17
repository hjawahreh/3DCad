# CLN-WORKFLOW-002A

**Ticket:** Final manual-gate closure for CLN-WORKFLOW-002  
**Date:** 2026-09-16 / 2026-09-17  
**Fixtures:** `apps/studio/public/clinical-fixtures/{upper,lower}.stl`  
**Walkthrough:** `docs/certification/cln-workflow-002a-browser-walkthrough.mjs`  
**Evidence JSON:** `docs/certification/cln-workflow-002a-browser-walkthrough.json`  
**Shots:** `docs/certification/cln-workflow-002a-browser-shots/`

## Orbit

Authoritative mapping unchanged: `yaw = −dx`, `pitch = −dy` (`camera-orbit-mapping.ts`).

Live `cameraSession` probe:

| Gesture | Result |
|---------|--------|
| mouse RIGHT | eye.x decreases — PASS |
| mouse LEFT | eye.x increases — PASS |
| mouse UP | eye.y increases — PASS |
| mouse DOWN | eye.y decreases — PASS |

Zoom, View Cube, and Home smoke-tested. **No sign change.**

## Auto Orientation

Real dual-arch import → `orientationOrigin=auto`, BOTH visible, canonical FRONT via `presentCanonicalClinicalView('front')` (shared with Home / View Cube FRONT). **PASS.**

## Upper Trim

Release-to-trim lasso on peripheral scrap (rad≈130):

| Op | beforeFingerprint | afterFingerprint | faces |
|----|-------------------|------------------|-------|
| Trim A | `geo:c828c055` | `geo:7a3b0e6e` | 261287 → 257913 |
| Trim B (different tip, no reload) | `geo:7a3b0e6e` | `geo:aa6bc754` | 257913 → 256291 |

**PASS** — exact region removed; fingerprint + face count change.

## Lower Trim

UPPER→LOWER isolation; lower cut `geo:856046ee` → `geo:be8b517e` (233562 → 229304). Upper fingerprint unchanged during lower trim. **PASS.**

## Clear / Redraw

Clear resets points; Trim stays active; status `Cleared — draw again, release to trim.` Repeated twice. **PASS.**

## Upper Base

Create Base auto-commits (no Accept). UI: `geo:aa6bc754` → `geo:0b9ae819` (256291 → 267654 faces). Engine gate (`geo-001d` real upper): watertight, manifold, boundaryEdges=0, no slab/bridge. **PASS.**

## Lower Base

**Engine:** real lower previously left `boundaryEdgeCount=3` because the fixture had **2 components** (main arch + 1-triangle scrap). Localized fix: `keepLargestFaceComponent` at start of `constructClinicalBase` (not a V2 redesign). Engine gate now PASSes with boundaryEdges=0.

**UI:** Create Base → `geo:be8b517e` → `geo:f2a13790` (229304 → 242277). No `Unable to triangulate clinical boundary without diagonal bridges`. **PASS.**

**Related UI fix:** `continueAfterCommit` now clears `progressMessage` so Create Base / Done are not stuck disabled after commit.

## Mark Teeth Persistence

Explicit contract:

| State | Persistence |
|-------|-------------|
| Mark Teeth markers (`toothMarkers`) | **Session-live only** — temporary inference inputs. Not in case save schema. |
| Accepted segmentation (`segmentationMeta`) | **Persisted** with the case. |

Documented in `docs/architecture/CLN-WORKFLOW-002.md` and `ClinicalSegmentationSession`. Walkthrough step `19-mark-teeth-contract` PASS.

## Workflow Regression

Import → Orient → Accept → Prepare/Warmup → Trim → Done → Base → Done → Segment → Edit → Mark → Auto → Adjust → Verify. No unintended stage skip. **PASS.**

## Manual Evidence

All 11 screenshots present under `cln-workflow-002a-browser-shots/`:

`01-import-both` … `11-verify-teeth`.

## Automated Tests

| Gate | Result |
|------|--------|
| typecheck (`apps/studio`) | PASS |
| build | PASS |
| vitest orbit (`geo-003a`) | PASS |
| vitest real upper/lower base (`geo-001d`) | PASS |
| vitest trim + workflow | PASS |
| Playwright CLN-WORKFLOW-002A | **PASS** (0 FAIL, 1 OBSERVE) |

## Performance

Upper/lower base engine ≈ 15–30s each on fixtures. Browser walkthrough end-to-end ≈ 20–25 min (warmup + multi-trim + dual base). No validation skipped.

## Remaining Issues

- **NEXT (Biomech):** button exists; `disabled` may be false when `acceptBlocked` is false, but click only notifies that biomechanics is locked (placeholder). Recorded as OBSERVE — biomechanics not started (by design).
- Production segmentation may remain BETA / REFERENCE when checkpoint uncleared (CLN-SEG-001).
- Headless freehand loops can self-intersect on small scrap radii; successful cuts use a larger peripheral neighborhood (documented in walkthrough attempts).

## Final certification

**PASS WITH OBSERVATIONS**

All mandatory gates closed (orbit verified unchanged, auto-orientation, upper/lower exact trim + repeat, clear/redraw, upper/lower clinical base, Mark Teeth contract, guided workflow). Observation: NEXT soft-lock UX vs hard `disabled` attribute.
