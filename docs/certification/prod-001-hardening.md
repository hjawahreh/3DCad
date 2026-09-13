# PROD-001 — Clinical Pipeline Production Hardening

**Status:** COMPLETE (audit + fixes).  
**Certification:** Phases 1–9 remain **PROTOTYPE / PARTIAL** until real-browser geometry commit + recovery are re-certified under this phase’s invariants. Prior “PASS” labels from phase reports must not be reused as production proof.

**Date:** 2026-09-11  
**Scope:** Geometry backend audit, Trim / Close Base root-cause repair, scene sync, performance/abort safety, observability, regression tests.  
**Non-goals:** Auto Orientation 2.0, new Segmentation AI, Movement, Biomechanics, Treatment Planning.

---

## Actual failures found

| Symptom | Observed in browser |
| --- | --- |
| Trim VALID → ACCEPT | Little or no visible geometry change |
| Workflow advances | Document/workflow treated trim as success |
| Close Base preview/accept | Malformed / oversized base; severe UI freeze |
| Fake success | Kernel + UI reported success without authoritative geometry delta |

---

## Root causes

### Trim

1. **Hard-coded mesh XY projection** (`trimMesh` / picks stored `local.x`/`local.y` only). Orientation is **transform-only**; scanner meshes are often thin in Y or Z, not Z. Gumline strokes therefore missed the real surface → exact clip removed **zero** triangles.
2. **No geometric delta gate** — Accept only required a fingerprint string, not `removedTriangles > 0` / face-count change.
3. **Viewport preferred `display` over `working`** — if display prep failed or lagged, the viewport could keep showing stale geometry after a working commit.
4. **Screen-space projection without viewport** collapsed to 1×1 mapping in some kernel paths (exacerbated no-change accepts once the delta gate existed).

### Close Base

1. **Extrusion axis from clinical orientation (`xz` / planeNormal)** while MeshRegistry geometry is still **unbaked** scanner space → walls extruded along the wrong axis → gigantic / malformed pedestals.
2. **Unbounded boundary loops** + ear-clip **O(n²)** on dense post-trim rims → main-thread freeze.
3. **Many noise loops** on imperfect topology amplified cost.
4. Accept could succeed even when generation was pathological or identity.

---

## Geometry backend evaluation

Current production path remains **`clinical-reference-v1`** (first-party TypeScript mesh ops behind Geometry Services → Kernel Bridge). Suitable for prototype clinical cuts/bases with the PROD-001 caps; **not** yet a full Boolean / hole-fill industrial backend.

Recommendation: keep the abstraction; evaluate native backends only behind Kernel Bridge for PROD-002+.

---

## Open3D evaluation

| Item | Assessment |
| --- | --- |
| License | MIT |
| Fit | Strong for mesh cleaning, hole filling, Boolean, PCA/spatial |
| Browser | Not native in-browser; would need Wasm/native worker or server |
| Suitability now | **Deferred** — high value for offline/worker path; do not couple clinical UI |
| Version (eval) | Track latest stable 0.18.x line when integrating |

---

## VTK evaluation

| Item | Assessment |
| --- | --- |
| License | BSD-3-Clause |
| Fit | Clipping, polydata cleaning, distance, robust filters |
| Constraint | **Must not** become the UI renderer (Three.js / Viewport Runtime stays) |
| Suitability now | **Deferred** as geometry-processing backend only if Open3D insufficient |

---

## Eigen evaluation

| Item | Assessment |
| --- | --- |
| License | MPL2 |
| Fit | Linear algebra, transforms, PCA, numerical geometry |
| Suitability | **Approved conceptually** for native kernels; do not invent a custom math library |
| Browser | Via Wasm or native addon — not for React UI thread |

---

## Embree evaluation

| Item | Assessment |
| --- | --- |
| License | Apache-2.0 |
| Fit | High-performance ray queries / picking / spatial intersection |
| Suitability | **Only if** benchmarks beat current Three.js raycaster + spatial index for dental mesh sizes |

---

## meshoptimizer evaluation

| Item | Assessment |
| --- | --- |
| License | MIT |
| Fit | Display mesh cache/index optimization only |
| Constraint | **Never** alter authoritative clinical geometry without explicit clinical algorithm justification |

---

## License review

| Dependency | Version (eval) | License | Linkage | Production | Redistribution |
| --- | --- | --- | --- | --- | --- |
| First-party kernel | `clinical-reference-v1` | Proprietary (product) | In-app TS | **Active** | N/A |
| Open3D | ~0.18 (eval) | MIT | Dynamic / Wasm | Candidate | Attribution |
| VTK | latest eval | BSD-3-Clause | Dynamic / Wasm | Candidate (non-UI) | Attribution |
| Eigen | 3.4.x | MPL2 | Static common | Candidate | File-level notices |
| Embree | 4.x | Apache-2.0 | Dynamic | Conditional | Attribution |
| meshoptimizer | 0.21.x | MIT | Static/Wasm | Display-only candidate | Attribution |
| CGAL | — | **GPL/commercial** | — | **Blocked** without legal approval | — |

**Do not** integrate GPL components into the commercial production path without explicit legal approval. CGAL remains evaluated-only.

---

## Trim fix

- Infer cut plane from AABB (**shortest axis = normal**; U/V = remaining axes).
- Project boundary + clip in U/V; preserve full 3D vertices.
- Mesh picker stores U/V on the inferred plane.
- **Reject** operations with `removedTriangles === 0` and unchanged face count:  
  `Trim produced no geometry change.`
- Handler validate mirrors the gate using kernel metrics/diagnostics.
- Default screen viewport 640×480 when omitted for screen-space strokes.

---

## Close Base fix

- Default extrude axis = **AABB shortest** (open-surface normal); clinical orientation is advisory unless `preferRequestedOrientation`.
- Caps: max loop vertices (768), max loops (4 largest), max added tris (80k), elapsed budget (8s default).
- Cooperative `shouldAbort` + timeout → clean `CANCELLED` / budget failure (no partial commit from kernel throw).
- Reject Accept when `addedTriangles <= 0`.
- Finite-coordinate validation on output.

---

## Scene synchronization

- After commit: MeshRegistry `working` updated; display prep aligned to **same revision**.
- On display prep failure: **`clearDisplay`** so viewport falls back to working.
- Viewport bind prefers display **only when** `display.revision === working.revision`; otherwise working/source.
- DEV diagnostics assert viewport geometry ref / fingerprint / faces (console, DEV only).

Contract preserved:

Clinical Tool → Operation Runtime → Geometry Services → Kernel Bridge → CommitToken → Clinical Document → Scene Republish.

---

## Persistence

- Authoritative mesh buffers remain in MeshRegistry / case binary path (not clinical JSON).
- Document descriptors carry fingerprint / revision / counts after commit.
- Cancelled preview must not change document revision (unchanged contract).
- Regression coverage: fixture trim/close delta; full Save→Reopen of large STLs remains a **PROD-002** browser checklist item (memory IndexedDB path already covered by case-persistence unit tests for metadata).

---

## Performance

- Close Base work stays off React render (async Operation Runtime), but CPU is still main-thread JS — caps + loop limiting prevent freezes observed on dense boundaries.
- Progress / cancel / timeout / memory-oriented triangle caps in place.
- Native/worker backends deferred (see evaluation).

---

## Memory

- Hard cap on added triangles.
- Loop subsample + largest-loop selection avoids pathological ear-clip blowups.
- Peak memory estimate still reported in kernel metrics.

---

## Browser results

Automated:

- Synthetic trim delta + no-change rejection — **PASS**
- Close Base cancel/timeout/finite — **PASS**
- `upper.stl` / `lower.stl` fixture trim/close bounded — **PASS** (`apps/studio/test/clinical/prod-001-hardening.test.ts`)

Manual (required before claiming production):

1. Import → Orient → Prepare → Trim → Draw → Validate → Accept — **removed region must disappear**
2. Undo restores prior mesh; Redo restores trim
3. Close Base preview anatomically bounded; Accept keeps UI responsive

Until manual checklist is signed, certification remains **PARTIAL**.

---

## Remaining blockers

1. Manual browser sign-off on real dual-arch fixtures (visual + undo/redo + reopen).
2. Main-thread Close Base still JS — worker/Wasm backend for large arches.
3. Orientation still transform-only — long-term bake-or-consistent-frame policy needed for all geometry ops.
4. Persistence reopen of committed mesh buffers under production IndexedDB quotas not re-proven in this phase’s automated suite.
5. No native Open3D/VTK yet — reference kernel remains the production geometry engine.

---

## Recommendation for PROD-002

1. Complete **manual browser acceptance** + Save/Close/Open geometry identity proofs; publish a new cert (do not inherit Phase 1–9 PASS).
2. Introduce optional **geometry worker** behind Kernel Bridge (Open3D Wasm *or* VTK filters) for Close Base / Exact Trim on full-resolution arches.
3. Define **clinical frame bake policy** (when orientation becomes authoritative mesh coordinates).
4. Expand DEV→QA diagnostics panel (still hidden from clinical users).
5. Only then resume feature work (Orientation 2.0 / Segmentation weights / Movement).

---

## STOP

PROD-001 stops here. Do **not** auto-start PROD-002 or new clinical features from this report.
