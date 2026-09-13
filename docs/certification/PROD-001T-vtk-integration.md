# PROD-001T — Native VTK Clinical Geometry Integration

**Status:** COMPLETE (integration + worker + interactive browser certification).  
**Verdict:** **PASS**  
**PROD-002:** Unlocked by this interactive browser PASS (do not start until operators explicitly begin PROD-002).  
**Date:** 2026-09-11  
**VTK worker:** 9.7.0 BSD-3-Clause via `http://127.0.0.1:8765`

---

## Scope

Wire proven PROD-001S VTK Trim / Close Base into CAD Studio through:

Surface pick → 3D loop + Newell normal → Operation Runtime → Geometry Services → Kernel Bridge → `HybridGeometryBackend` → VTK HTTP worker → validate → commit → viewport.

No PROD-002 / segmentation / orientation / analysis redesign.

---

## Architecture

```text
ClinicalMeshViewport / ClinicalMeshPicker (world + mesh-local X/Y/Z)
  → ClinicalTrimLoop3d (prefer mesh-local loop3d; Newell + validation)
  → ClinicalTrimOperation / Handler (loop3d, loopNormal, keepMode)
  → GeometryServicesKernelPort (passthrough)
  → ClinicalGeometryKernelBridge (async runTrim / runCloseBase)
  → HybridGeometryBackend
       ├─ VtkHttpWorkerBackend  (when worker healthy + vtk-implicit-loop)
       └─ clinical-reference-v1 (sync fallback / tests without world picks)
  → MeshRegistry working/display → Scene → Viewport
```

Frozen contracts preserved. No VTK types in React / Clinical Document / Trim Runtime / Close Base Runtime (architecture test added).

---

## VTK worker

| Item | Value |
|---|---|
| Sidecar | `tools/geometry-backend-bench/vtk_worker_http.py` |
| Port | `8765` (`CAD_VTK_WORKER_PORT`) |
| Endpoints | `GET /health`, `POST /v1/geometry` |
| Payload | geometry-neutral JSON + base64 mesh buffers |
| Trim | `vtkImplicitSelectionLoop` + `vtkClipPolyData` |
| Close Base | `vtkContourTriangulator` + `vtkLinearExtrusionFilter` |
| UI thread | **never** runs VTK |

Start:

```bash
/tmp/cad-geom-bench/bin/python tools/geometry-backend-bench/vtk_worker_http.py
```

Composition root probes health every 10s and enables hybrid VTK when available. Studio logs:

`[geometry] VTK HTTP worker available — hybrid backend enabled`

---

## Surface picking

`ClinicalMeshPicker` supplies:

- `worldX/Y/Z` — display/world hit
- `localX/Y/Z` — mesh-local hit (authoritative for VTK `loop3d` after orientation)
- `meshX/Y` — projected UV for legacy screen/AABB validation

Trim submit:

1. Requires complete surface picks when any world/local coordinate is present.
2. Builds `loop3d` via `buildClinicalTrimLoop3d` (**prefers mesh-local** so oriented cases match MeshRegistry buffers).
3. Sets `algorithm: 'vtk-implicit-loop'`, `keepMode: 'KEEP_OUTSIDE'`.

Screen-only strokes (tests / incomplete picks without 3D) still use clinical-reference exact-edge-clip.

---

## 3D loop / Newell normal

`ClinicalTrimLoop3d.ts`:

- dedupe, min points, finite checks
- Newell normal (reject unstable)
- projected area gate
- non-adjacent self-intersection
- planarity RMS recorded

Failure messages include:  
`Trim boundary orientation could not be determined.`

---

## keepMode

| Clinical | VTK InsideOut (empirical) |
|---|---|
| `KEEP_OUTSIDE` (default remove interior) | `false` |
| `KEEP_INSIDE` | `true` |

Aliases `remove-interior` / `keep-interior` normalize via `normalizeTrimKeepMode`.

---

## Trim

- Bridge uses `await runTrim(...)` (async worker path).
- No-op / invalid geometry rejected before commit.
- Cancel: AbortSignal → worker fetch abort; no CommitToken on failure path (existing Operation Runtime).

---

## Close Base

- Handler sets `preferRequestedOrientation: true` (clinical plane, not AABB authority).
- Extrusion direction = **negated** clinical plane normal (inferior into base).
- Hybrid routes to VTK HTTP when worker healthy; reference remains diagnostic fallback when worker down.
- Browser cert confirmed `direction_source: clinical:xz` on worker requests.

---

## Quality validation

Worker + bridge gates:

- finite coordinates
- non-empty
- removed/added triangle deltas
- bounds growth ceilings (worker)
- fingerprint change

---

## Cancellation / Timeout

- Fetch `AbortController` + 90s default timeout on `VtkHttpWorkerBackend`
- Kernel `signal.aborted` checked via async path
- Cancelled jobs do not commit

---

## Performance (HTTP smoke + browser)

| Op | Result |
|---|---|
| HTTP trim (simple_convex) | ok on fixtures |
| Browser VTK trim (upper after orient) | ok, −16260 tris (261287 → 245027) |
| Browser VTK close_base after trim | ok, 245027 → 254293; backend `hybrid-vtk-reference-v1` |

Full p50/p95 corpus remains in `docs/performance/prod-001s-vtk-spike.md`.

---

## Memory

Mesh transfer via base64 Float32/Uint32 over localhost. Peak not instrumented in-browser; worker rejects triangle explosions (`MAX_OUTPUT_TRIS`).

---

## Browser results (interactive certification)

Walkthrough: `docs/certification/prod-001t-browser-walkthrough.mjs`  
Evidence JSON: `docs/certification/prod-001t-browser-walkthrough.json`  
Screenshots: `docs/certification/prod-001t-browser-shots/`

| Item | Status |
|---|---|
| Worker startup (`vtk_worker_http.py` :8765) | **PASS** |
| Worker health from Studio (`VTK HTTP worker available`) | **PASS** |
| VTK Trim preview (boundary overlay + valid loop) | **PASS** |
| VTK Trim commit (HTTP `cmd=trim`, mesh fingerprint/faceCount change) | **PASS** |
| Undo (geometry restored) | **PASS** |
| Redo (committed trim restored) | **PASS** |
| Save / reopen (fingerprint persisted) | **PASS** |
| VTK Close Base (`clinical:` direction_source; mesh grew) | **PASS** |
| Evidence screenshots | **PASS** |

**Interactive summary:** 17/17 walkthrough checks PASS (2026-09-11).

---

## Persistence / Undo/Redo

Contracts unchanged (CommitToken → Document → MeshRegistry → History). Interactively re-proven on VTK Trim path during browser certification.

---

## Defects found during browser certification (minimal fixes)

1. **`process is not defined` in browser** — `VtkHttpWorkerBackend` read bare `process.env`; replaced with `globalThis.process?.env` helper so Vite client boot works.
2. **World-space `loop3d` after orientation** — surface picks stored world XYZ while MeshRegistry buffers stay mesh-local; VTK reported “no geometry change”. Fixed by recording `localX/Y/Z` on picks and preferring mesh-local points in `boundaryToLoop3dPoints`.

---

## Remaining limitations (non-blocking)

1. Freehand density / false self-intersect edge cases still need clinical QA.
2. Node `VtkNativeWorkerBackend` is Vitest/sidecar-only (not browser-bundled).
3. Display mesh “candidate vs original” dual view still uses working commit semantics of current Trim.
4. Browser cert signed the upper-arch Trim → Close Base path; lower arch was not separately trimmed in the same walkthrough.

---

## Decision after this phase

| Operation | Decision |
|---|---|
| VTK Trim | **Production candidate behind HTTP worker** — interactive browser signed |
| VTK Close Base | **Production candidate behind HTTP worker** — interactive browser signed |

Independent promotion allowed. **Do not start PROD-002** until an operator explicitly begins that phase after this PASS.

---

## Tests run

- Studio typecheck — PASS (prior integration gate)
- Studio build — PASS (prior integration gate)
- Clinical Vitest — PASS (prior integration gate)
- Architecture (incl. no VTK in clinical trim/close-base) — PASS
- PROD-001T unit tests — PASS
- HTTP worker trim + close_base smoke — PASS
- **Interactive browser walkthrough** — **PASS** (17/17)
