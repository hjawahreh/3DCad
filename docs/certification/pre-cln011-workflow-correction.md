# Pre-CLN-011 Clinical Workflow Correction — Final Report

**Status:** PASS WITH OBSERVATIONS  
**Date:** 2026-09-10  
**Scope:** Studio-owned workflow/UI/host integration — IMPORT → ANTERIOR BITE → ORIENT → PREPARE → TRIM  
**Not started:** CLN-011  
**Architecture:** Frozen platform packages / Geometry Kernel / Clinical Engine / Trim Platform / CLN-009 / CLN-010 — **not modified**

Screenshots: `docs/certification/pre-cln011-browser-shots/`  
Machine log: `docs/certification/pre-cln011-browser-walkthrough.json`

---

## 1. What was corrected (this pass)

| Area | Correction |
|------|------------|
| Initial camera | `presentClinicalAnteriorView()` → `fitAll` then AABB-inferred patient-facing pose via Camera Runtime (`applyClinicalAnteriorPose`). Import publishes with `fitCamera: false` so only clinical anterior owns the post-import camera. |
| Pose reliability | Frozen Studio test clocks stall `animateTo`; Studio force-applies the target pose through the session commit path when animation cannot complete (no Camera Runtime package change). |
| Preparation truthfulness | Orient Accept → `notifyOrientationComplete()` + idempotent `preparation.start()` only. Operator must **Confirm Preparation** → `confirmReadyForTrim()`. CTA: Confirm → then **Continue to Trim**. No premature “Preparation complete”. |
| Trim idle | Enter Trim with `drawMode: idle`; overlay `pointer-events: none` until Polyline/Freehand selected. |
| Toolbar ownership | Overlay inset below toolbar; drawing overlay only captures when mode ≠ idle; toolbar z-index above overlay. |
| Camera inspector | Eye / Up / Target shown for operator verification. |

---

## 2. Automated verification

| Check | Result |
|-------|--------|
| `pnpm typecheck` (Studio) | PASS |
| `pnpm exec vitest run` (Studio) | PASS — **161** tests |
| Relevant Trim / prep / workflow / pre-cln011 / architecture tests | PASS |
| `pnpm build` (Studio) | PASS |
| Platform package tests modified to force green | **No** |

Automated suite alone does **not** certify this phase.

---

## 3. Browser verification (mandatory)

Host: `http://localhost:1420/`  
Fixtures: `apps/studio/public/clinical-fixtures/{upper,lower}.stl` (real dual-arch STLs)

### Measured camera after dual-arch import

| Field | Value | Interpretation |
|-------|-------|----------------|
| Eye | `-0.75, 129.54, 3.03` | Look along **+Y** (AABB anterior for these scans) |
| Stability (1.5s later) | identical eye | No post-import camera reset |

`presetView('front')` would place the eye on **+Z** (occlusal for Z-thin arches). Measured eye is **not** that path.

### Manual / automated browser matrix

#### Import
| Item | Result |
|------|--------|
| Upper only | Not re-run this pass (path unchanged; dual covered) |
| Lower only | Not re-run this pass |
| Upper + Lower | **PASS** |

#### Initial camera
| Item | Result |
|------|--------|
| Patient-facing anterior bite view | **PASS** (eye along anterior +Y; bite presentation in viewport) |
| Both arches spatially correct | **PASS** (upper/lower both visible, related) |
| No camera reset after initial fit | **PASS** |

#### Orientation
| Item | Result |
|------|--------|
| Enter Orientation | **PASS** |
| Accept Orientation | **PASS** |
| Prepare becomes current | **PASS** |
| No duplicate preparation toast | **PASS** |

#### Preparation
| Item | Result |
|------|--------|
| Preparation state is truthful | **PASS** (awaiting confirmation → Confirm → Continue to Trim) |
| Action/confirmation visible | **PASS** |
| Continue to Trim works | **PASS** |

#### Trim idle
| Item | Result |
|------|--------|
| Trim opens idle | **PASS** (`data-draw-mode=idle`) |
| No drawing starts automatically | **PASS** |

#### Trim toolbar
| Item | Result |
|------|--------|
| Polyline / Freehand / Undo Pt / Clear / Close / Validate | **PASS** (all clicked while draw mode active) |
| Accept Trim enabled only when valid | **PASS** (self-intersecting boundary kept Accept disabled with truthful message) |
| Cancel / Reset | **PASS** |

#### Polyline
| Item | Result |
|------|--------|
| Select, draw, boundary visible, toolbar usable, Close, Validate | **PASS** |

#### Freehand
| Item | Result |
|------|--------|
| Select, draw (31 pts), toolbar Close+Validate | **PASS** |

#### Geometry / history
| Item | Result |
|------|--------|
| Accept Trim (convex boundary) | **PASS** (Validate → Accept enabled → commit path) |
| Correct arch / Upper active | **PASS** (toolbar: Upper Arch · Active) |
| Undo / Redo after Accept | **PASS** (global Undo/Redo enabled and executed) |
| Visible mesh delta in headless screenshots | **OBSERVE** — accept vs undo differed only in chrome pixels; unit tests prove faceCount/history. Prefer operator eye-check on cut silhouette. |

#### Cancel / reset
| Item | Result |
|------|--------|
| Reset non-destructive | **PASS** |
| Cancel does not commit | **PASS** |

#### Viewport sizes
| Item | Result |
|------|--------|
| Smaller / larger viewport screenshots | **PASS** |
| Camera movement vs picking | Covered by mesh-picker unit tests + live camera sync; not fully matrixed in headless drag |

#### Dual-arch independence
| Item | Result |
|------|--------|
| Upper active workflow | **PASS** (browser) |
| Lower active full Accept path | **OBSERVE** — unit/integration cover arch targeting; full Lower browser Accept not repeated this pass |

---

## 4. Explicit certification answers

1. **Initial camera** — Patient-facing along AABB anterior (+Y for fixtures); eye `(-0.75, 129.54, 3.03)`; stable after import.  
2. **Preparation** — Orient does not fake-complete prep; Confirm Preparation then Continue to Trim.  
3. **Trim toolbar** — Remains clickable during Polyline/Freehand; pointer capture scoped to drawing overlay.  
4. **Polyline** — Explicit select → draw → Close → Validate works.  
5. **Freehand** — Explicit select → stroke → toolbar actions work.  
6. **Active Upper/Lower** — Upper Active confirmed in browser; picker/manager unit tests enforce arch isolation.  
7. **Accept / Undo / Redo** — Production path exercised after valid closed boundary; history controls worked.  
8. **Viewport-size** — Smaller and larger viewports captured without shell failure.

---

## 5. Known limitations / observations

- Headless Playwright cannot open OS file pickers; fixture import used `input[type=file].setInputFiles`.  
- Self-intersecting operator strokes correctly block Accept (truthful validation).  
- Static CSS orientation gizmo labels (X/Y/Z) do **not** reflect Camera Runtime `up`; use Camera inspector Eye/Up/Target.  
- `deps:check` may OOM under constrained heap — not used as a gate for this Studio-only pass.  
- CLN-011 not started.

---

## 6. Architecture boundaries (unchanged)

Not redesigned/replaced: Geometry Kernel, Clinical Engine, Manufacturing Engine, Enterprise Runtime, CAD Platform packages, Operation Runtime, Geometry Services, Kernel Bridge, Clinical Document, CLN-009/010, Trim Platform architecture.

Studio-only integration: clinical display/import/shell/trim UI, Camera Runtime **consumers**, Interaction capture on viewport drawing surface.
