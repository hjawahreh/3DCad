# PROD-001S — VTK Clinical Trim + Close Base Spike

**Status:** COMPLETE (spike evidence).  
**PROD-002:** **BLOCKED**.  
**Date:** 2026-09-11  
**VTK:** 9.7.0 (Python native worker)  
**License:** BSD-3-Clause  

---

## Executive decision

| Operation | Classification | Notes |
|---|---|---|
| **Trim** | **C — VTK specialized worker only** | Real cell cutting with `vtkImplicitSelectionLoop` + `vtkClipPolyData` on open dental STLs. Not Studio-production-enabled; clinical UI still 2D stroke; browser interactive path not wired. |
| **Close Base** | **B — VTK Close Base production candidate (worker)** | `vtkContourTriangulator` + `vtkLinearExtrusionFilter` produced bounded bases (+~6–7k tris, bounds growth ≈1.00–1.01) on VTK-trimmed arches. Not linked into Studio UI thread yet. |

Neither operation replaces `clinical-reference-v1` in the browser composition root.

---

## Architecture

```text
Clinical Tool → Operation Runtime → Geometry Services → Kernel Bridge
  → GeometryBackend
       ├─ clinical-reference-v1          [authoritative browser]
       └─ VtkNativeWorkerBackend         [PROD-001S spike — child_process Python]
            → tools/.../vtk_clinical_spike.py
                 → vtkImplicitSelectionLoop + vtkClipPolyData
                 → vtkContourTriangulator + vtkLinearExtrusionFilter
```

- Clinical / React / Document: **no VTK types**
- Contract extension (backend options only): `loop3d`, `loopNormal`, `keepMode`, algorithm `vtk-implicit-loop`
- Platform / Operation Runtime / Geometry Services / Kernel Bridge contracts: **unchanged**

---

## InsideOut convention (empirical)

On dental STLs with `vtkImplicitSelectionLoop`:

| `InsideOut` | Measured effect | Clinical mapping |
|---|---|---|
| **False** (default) | Keep exterior; remove loop interior (e.g. 233562→232350, −1212) | **REMOVE interior** |
| **True** | Keep tiny interior remnant (~2k tris) | KEEP selected |

Do not trust docs alone — measure.

---

## Fixture inventory

| Metric | lower | upper |
|---|---:|---:|
| Triangles | 233,562 | 261,287 |
| Clean points | 118,085 | 131,779 |
| Boundary edges | 2,604 | 2,273 |
| Watertight | false | false |
| Edge / vertex manifold | true / true | true / true |
| Diagonal | 90.07 | 89.63 |

Full tables: `docs/performance/prod-001s-vtk-spike.md`

---

## Trim evidence (corrected InsideOut)

Representative (p50 total):

| Case | lower | upper |
|---|---|---|
| simple_convex | ok, −1212 tris, ~0.9 s | ok, −3 tris, ~0.7 s |
| large | ok, −48k | ok, −50k |
| freehand | ok, −10k | no-op rejected / rem≈0 |
| self_intersecting | **rejected** | **rejected** |
| small | rem≈0 / no-op risk | **no-op rejected** |

Failures / caveats:

1. Small loops may produce **no geometry change** → must reject (gate added).
2. Post-snap concave / dense loops can trip 2D self-intersection check (false positives) — needs loop QA before clip.
3. Planarity RMS on nonplanar samples ~0.5–1.2 mm (acceptable for ImplicitSelectionLoop projection in spike).
4. **Browser interactive Trim not executed** — no claim of UI PASS.

---

## Close Base evidence

After VTK trim (remove-interior):

| Arch | Added tris | Bounds growth | Result |
|---|---:|---:|---|
| lower | ~5,948 | ≈1.00–1.007 | ok (all direction candidates) |
| upper | ~6,966 | ≈1.00–1.0001 | ok |

Directions compared: `clinical_neg_y`, `clinical_neg_z`, `aabb_shortest`, `boundary_normal_neg` — all passed quality gates in this corpus. Prefer **clinical orientation / boundary normal** when available; do not require AABB.

Height: ~3% of diagonal, clamped to [1.5, 8].

---

## Comparison vs clinical-reference-v1

| | clinical-reference-v1 | VTK spike |
|---|---|---|
| Trim input | 2D stroke + AABB UV projection | Explicit **3D loop + Newell normal** |
| Cutting | exact-edge-clip (TS) | Cell cutting (`vtkClipPolyData`) |
| Close Base | capped ear-clip extrude | ContourTriangulator + LinearExtrusion |
| Browser | linked | **not linked** |
| Failure behavior | throws / caps | reject messages; worker discard |

---

## Browser verification

**NOT PASS / not executed for VTK path.**

Required Studio interactive checklist remains pending until a Tauri/native sidecar hosts `VtkNativeWorkerBackend` and clinical trim forwards `world*` picks as `loop3d` + Newell normal.

---

## Persistence / Undo / Redo

Not claimed for VTK path (backend not composition-root linked). clinical-reference history contracts unchanged.

---

## Tests / commands

- Offline: `CAD_VTK_PYTHON=/tmp/cad-geom-bench/bin/python python tools/geometry-backend-bench/vtk_clinical_spike.py --bench`
- Vitest: `apps/studio/test/clinical/geometry/prod-001s-vtk.test.ts`
- Typecheck / Clinical suite / architecture — run with Studio package scripts

---

## Stop conditions / blockers for A (Trim production)

1. Wire clinical surface picks → `loop3d` + stable normal (no AABB substitute).
2. Native/Tauri worker in composition root (off UI thread).
3. Harden concave/dense loop validation without false self-intersect rejects.
4. Signed browser Trim + Undo/Redo + Save/Reopen.

## PROD-002

**Do not start.**
