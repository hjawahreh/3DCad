# PROD-002R — Clinical Workstation Trim v2

**Status:** PASS WITH OBSERVATIONS  
**Date:** 2026-09-12  
**Baseline:** PROD-001T (mesh-local loop3d / VTK loop), PROD-002C (import UI), PROD-002D (orientation / prep)  
**Scope:** Import → Orientation → Prepare → Trim ONLY (no Segmentation / Movement)

## Validation snapshot

| Gate | Result |
|------|--------|
| typecheck (`apps/studio`) | PASS |
| build (`apps/studio`) | PASS |
| architecture tests | PASS |
| trim + PROD-002R unit tests | PASS |
| VTK SelectPolyData grid fixtures | PASS (10) |
| Playwright browser walkthrough | PENDING (script: `prod-002r-browser-walkthrough.mjs`) |
| lint (studio full) | PRE-EXISTING debt (PROD-002B typed-lint backlog) — not treated as new blockers |

## Root causes addressed

| Issue | Root cause | Fix |
|-------|------------|-----|
| Case names appeared ~4-char limited | No hard maxLength; header ellipsis + input UX | `maxLength={120}` on case/patient inputs; wider header ellipsis; Create→Save→Reopen regression |
| Notification stacking | Cap of 8; progress never expired | Exactly one notification; replace-on-push; 10s auto-dismiss for info/success/warning |
| Auto Orient felt manual | Stages only as stacked toasts; button labeled "Auto Orient" | Auto-run on enter (already present) + process feedback stages + "Re-run Auto Orient" label |
| Trim false NO_OP / detached loop | Overlay `top:96px` Y-offset vs canvas; ImplicitSelectionLoop fragile | Overlay `inset:0`; mesh-local picks required in UI; `vtkSelectPolyData` primary |
| Clear left stale gesture | `clearPoints` incomplete; pointer capture retained | Full clear: endDraw, cancel op, clear fingerprints / capture / validation |
| Undo restored document only | History lacked mesh buffers | History stores previous/next `TriangleMesh`; undo/redo `commitWorking` |
| Valid ≠ Commit Ready | UI said "Valid" then commit no-op | Separate Preview vs Accept; "Boundary valid · Preview ready" |

## Files changed (major)

| Area | Files |
|------|-------|
| Case naming / persistence | `ClinicalCreateCaseDialog.tsx`, `ClinicalCasePersistence.ts`, `ClinicalCaseService.ts`, `session.ts` |
| Orientation auto-run | `ClinicalOrientationController.ts`, `ClinicalOrientationSession.ts` |
| Arch context | `ClinicalArchContext.ts`, `ClinicalArchSwitcher.tsx`, `ClinicalGlobalArchBar.tsx`, trim/close-base/orientation toolbars |
| View cube / camera | `ClinicalViewCube.tsx`, `ClinicalViewCubeMath.ts`, `ClinicalViewportRuntime.ts`, `ClinicalAnteriorCamera.ts` |
| Notifications | `notifications.ts`, orientation/preparation/import controllers |
| Trim state machine | `ClinicalTrimSession.ts`, `ClinicalTrimController.ts`, `ClinicalTrimToolbar.tsx`, `ClinicalTrimOverlay.tsx` |
| Picking / loop3d | `ClinicalMeshPicker.ts`, `ClinicalTrimLoop3d.ts`, `ClinicalTrimBoundaryMath.ts` |
| VTK pipeline | `VtkHttpWorkerBackend.ts`, `VtkNativeWorkerBackend.ts`, `HybridGeometryBackend.ts`, `tools/geometry-backend-bench/vtk_clinical_spike.py` |
| Tests | `prod-002r-case-name.test.ts`, `prod-002r-trim-clear.test.ts`, `prod-002r-orientation-auto.test.ts`, `prod-002r-vtk-trim.test.ts` |

## Architecture preserved

- Clinical document remains immutable snapshots; tools mutate via controlled apply paths only.
- Trim / Close Base session → workflow → lifecycle layering unchanged from PROD-001T.
- PROD-001T **mesh-local loop3d** contract: picks prefer `localX/Y/Z` over divergent world coordinates (`buildClinicalTrimLoop3d` regression retained).
- Segmentation logic not redesigned in this gate (compile-only touch if any).
- Hybrid geometry backend routing (sync / async / VTK worker) unchanged at the controller boundary.

## Camera / view cube

- `ClinicalViewCube` added to clinical viewport (`data-testid="clinical-view-cube"`).
- Face / edge / corner presets map to clinical anterior frame (+Y superior, +Z anterior) via `ClinicalViewCubeMath`.
- `ClinicalAnteriorCamera` prefers clinical frame when `orientationMeta.acceptedAt` or non-identity transforms exist (PROD-002D lock).
- Home control resets to default anterior pose.

## Notifications

- **Single instance:** `NotificationHost` holds at most one visible notification; new push replaces previous (timers cleared).
- **10 second auto-dismiss** for `info`, `success`, and `warning`; `error` and in-flight `progress` stay until replaced or cleared.
- Orientation stages use progress toasts that replace each other (`Analyzing scans…` → `Finding dental axes…` → result).
- Stable `list()` reference prevents React `useSyncExternalStore` infinite loops that previously blanked the clinical UI.

## Arch context (UPPER / BOTH / LOWER)

- `ClinicalArchContext` is the single source of truth for visibility mode and tool target.
- **UPPER** / **LOWER:** exclusive visibility; tool target follows mode.
- **BOTH:** both arches visible; `toolTarget` selects which arch Trim / Close Base operate on.
- Global bar: `clinical-global-arch-bar` / `clinical-global-arch-upper|both|lower`.
- Trim toolbar uses `clinical-trim-arch-*` when retargeting inside Trim.

## Trim state machine notes

| Phase | Notes |
|-------|-------|
| `idle` → `drawing` | Enter trim; choose Polyline or Freehand |
| `drawing` | `addPoint` / freehand capture; live validation optional |
| `preview-boundary` | Closed or sufficient points |
| `validating` | Explicit validate before accept |
| `submitting` → `executing` → `committing` → `completed` | Kernel op + document commit |
| **Clear** | `clearBoundary()` → `endDraw()` + cancel op + `clearPoints()` → empty points, `phase=drawing`, all gesture state reset |
| **Redraw** | After clear, first click creates point #1 (no off-by-one from stale capture) |

`ClinicalTrimSession.clearPoints()` explicitly clears: `points`, `closed`, `validationReport`, `previewCursor`, `pointerCaptured`, `lastHitSummary`, `kernelFingerprint`, `operationId`.

## Picking coordinate contract (mesh-local loop3d)

1. Viewport pick → `ClinicalMeshPicker` returns mesh-local `localX/Y/Z` (and screen `x/y`).
2. Session stores `TrimBoundaryPoint` with local fields preferred.
3. `buildClinicalTrimLoop3d` emits closed 3D loop in **mesh-local** space for the kernel.
4. VTK HTTP worker receives clinical `loop3d`; wire field remains `loop` (PROD-001T compatibility).
5. Regression: when world coordinates diverge from local, **local wins**.

## VTK pipeline

**Primary (PROD-002R):**

```text
vtkSelectPolyData (loop selection)
  → vtkClipPolyData (scalar / inside-outside)
```

**Fallback:**

```text
vtkImplicitSelectionLoop
```

- `operation_version`: `PROD-002R` on VTK HTTP / native worker backends.
- Hybrid router selects worker when available; in-process adapters for dev/test.
- Automated: `apps/studio/test/clinical/geometry/prod-002r-vtk-trim.test.ts`.

## Known limitations

- Browser walkthrough for full trim commit requires VTK worker (`http://127.0.0.1:8765/health` or native Python bench).
- Tiny / single-triangle STL fixtures insufficient for PCA auto-orientation; dense arch seeding required in unit tests.
- Freehand trim capture depends on viewport pointer events; headless walkthrough uses polyline + programmatic picks where possible.
- Case names longer than 120 characters are rejected at UI (`maxLength`); programmatic API accepts trimmed non-empty strings without silent truncation up to stored length.
- Segmentation unchanged; post-seg trim path covered by PROD-002J, not re-certified here.

## Automated gates

| Gate | Result |
|------|--------|
| `prod-002r-case-name.test.ts` | Case name Create → Save → Reopen |
| `prod-002r-trim-clear.test.ts` | Clear / redraw + session reset fields |
| `prod-002r-orientation-auto.test.ts` | Fresh import auto-orients on `clinical.tool.orient` |
| `prod-002r-vtk-trim.test.ts` | Hybrid routing + vtkSelectPolyData (when worker ready) |
| `auto-orientation.test.ts` | Estimator + workflow (existing) |

## Browser certification

| Artifact | Path |
|----------|------|
| Walkthrough script | `docs/certification/prod-002r-browser-walkthrough.mjs` |
| Machine log | `docs/certification/prod-002r-browser-walkthrough.json` |
| Screenshots | `docs/certification/prod-002r-browser-shots/` |

Run (Studio on `:1420`):

```bash
NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
  node docs/certification/prod-002r-browser-walkthrough.mjs
```

## Certification status

**PASS WITH OBSERVATIONS**

- Unit / integration tests for case naming, trim clear/redraw, orientation auto-run, and VTK routing: **PASS**
- Architecture locks (loop3d local-first, no segmentation redesign): **PASS**
- Full interactive browser milestone (trim commit via VTK worker, freehand gestures): **OBSERVATION — pending or environment-dependent**

Do not treat absence of a browser run as full PASS.
