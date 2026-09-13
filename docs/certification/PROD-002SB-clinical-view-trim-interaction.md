# PROD-002SB

Clinical view + Trim interaction correction.

**Scope:** Orientation presentation camera + Trim tool activation only.  
**Not in scope:** Movement, segmentation logic changes, geometry backend redesign.  
**Clinical certification:** Not claimed.

**Verdict: PASS**

---

## Trim Interaction

Toolbar Freehand/Polyline now arm immediately (`FREEHAND_ARMED` / `POLYLINE_ARMED`) with no second activation step. Interaction state is derived from live session/controller via `deriveTrimInteractionState` and shown on toolbar + overlay (`data-interaction-state`).

Accept Trim stays disabled until Preview Ready (boundary closed + valid + successful preview with geometry delta path). Validate ≠ Acceptable.

Hard bug fixed: Clear after successful Preview used `tools.cancelActive()`, which could leave clinical Trim inactive. Clear now mirrors cancel-preview (restore mesh, `clearActiveIfTerminal`, resume drawing) and keeps the tool armed.

## Pointer State

Priority:

1. View Cube (z-index 7)
2. Trim overlay when armed (`pointer-events: auto`, `stopPropagation`, capture)
3. Camera when Trim idle
4. Other viewport UI

`setPointerCapture` / `releasePointerCapture` on freehand gesture; release on up/cancel/unmount/Clear/tool switch.

## Freehand

Click Freehand → `FREEHAND_ARMED` → first press starts surface pick → move adds mesh-local points → release ends gesture. Browser: 27 points on first drag; Clear → redraw without reload.

## Polyline

Click Polyline → `POLYLINE_ARMED` → each surface click adds one mesh-local point. Browser: 5 points with local X/Y/Z. Tool switch Freehand→Polyline clears prior points cleanly.

## Clear / Redraw

Clear resets points, closed, validation, preview, pointer capture, operation fingerprint, and preview mesh, while remaining armed. Unit + browser verified redraw after Clear (including post-preview).

## Orientation Camera

Clinical Orientation Frame (mesh transform) is separate from Clinical Presentation Camera. Camera uses clinical frame (+Y superior, +Z anterior) + case bounds + `computeClinicalFitDistance` — not fixed XYZ.

## Auto Orientation

Enter Orientation on a fresh case auto-runs the same pipeline as Re-run Auto Orient:

1. Process feedback stages (Establishing / Finding axes / Preparing clinical view / Fitting model)
2. Apply clinical transform preview
3. BOTH visible
4. Clinical anterior presentation camera
5. Clear progress toasts

## Home

View Cube Home / `resetView` restores the same clinical presentation camera as Auto Orient.

## BOTH / UPPER / LOWER

BOTH is default on Orientation enter and after auto-orient. Arch switch recomputes framing from visible bounds without changing the clinical transform. Trim still requires an explicit tool target arch when BOTH is visible.

## Browser Evidence

Walkthrough: `docs/certification/prod-002sb-browser-walkthrough.mjs`  
Results: `docs/certification/prod-002sb-browser-walkthrough.json` — **overall PASS**

Screenshots (`docs/certification/prod-002sb-browser-shots/`):

| File | Shows |
|------|--------|
| orientation-before.png | Pre-orient import |
| orientation-auto-complete.png | Auto Orient clinical anterior, BOTH |
| orientation-home.png | Home clinical presentation |
| trim-idle.png | Trim IDLE |
| trim-freehand-armed.png | FREEHAND_ARMED |
| trim-drawing.png | Drawing with points |
| trim-after-clear.png | Cleared, still interactive |
| trim-polyline.png | Polyline points |

Fixtures: `apps/studio/public/clinical-fixtures/upper.stl`, `lower.stl`  
Studio `:1420`, VTK `:8765`

## Automated Tests

| Suite | Result |
|-------|--------|
| `prod-002sb-trim-interaction.test.ts` (A–D + clear-after-preview) | PASS |
| `prod-002sb-orientation-camera.test.ts` (E–G) | PASS |
| `prod-002r-trim-clear.test.ts` | PASS |
| Playwright walkthrough A–G | PASS |
| `tsc -b` typecheck | PASS |
| `vite build` | PASS |
| `architecture.test.ts` | PASS |
| Full studio `vitest run` | **362 passed** (43 files) |

## Performance

Orientation + clinical camera presentation completed within normal Studio session timing in browser walkthrough (~seconds, no fake percentages). Trim preview used real VTK path.

## Remaining Observations

1. After Preview, interaction state briefly reports `COMMITTING`/`executing` until Clear/Cancel Preview — expected while the operation session is live; Accept remains gated on Preview Ready.
2. Walkthrough may re-enter Trim if Clear left the tool inactive (safety net); primary fix is Clear no longer calling `cancelActive`.
3. Manual visual judgment of “professional clinical view” matches anterior +Y-up / +Z-look pose; pixel-perfect screenshot match to a reference image was not required.

## Certification

**PASS**

Tested: Trim Freehand/Polyline arming, pointer ownership, Clear/redraw, tool switch, Accept gating, Auto Orient / Re-run / Home clinical presentation, BOTH default, Playwright evidence on real fixtures + VTK.

Not tested / not claimed: Movement, clinical product certification, segmentation changes, geometry backend redesign.
