# Geometry Backend Evaluation (PROD-001R)

**Date:** 2026-09-11  
**Status:** Evidence complete — hybrid selection (no single in-browser winner)  
**Fixtures:** `apps/studio/public/clinical-fixtures/upper.stl`, `lower.stl`  
**Raw benches:** `docs/performance/geometry-backend-benchmarks.raw.json`

Architecture lock preserved:

```text
Clinical Tool → Operation Runtime → Geometry Services → Kernel Bridge → Geometry Backend
```

Clinical / React layers must not import Manifold, Open3D, VTK, Embree, Eigen, or nanoflann types.

---

## Current prototype failures (pre-selection)

| Symptom | Root cause class |
|---|---|
| Trim validates/accepts with no visible cut | Projection / whole-triangle heuristics; fixed partially in PROD-001 (`exact-edge-clip` + delta gate) |
| Close Base pathological / giant geometry | Wrong extrude axis (orientation vs unbaked scanner space); AABB inference + caps in PROD-001 |
| Close Base UI freeze | Unbounded ear-clip on dense loops; capped in PROD-001 |
| AABB used as geometry authority | Inference for plane axes only is acceptable; AABB extrusion as “exact op” is not |

PROD-001R does **not** add another heuristic engine. It selects/refuses mature backends from measured evidence.

---

## Fixture inventory (Open3D 0.19.0)

| Metric | lower.stl | upper.stl |
|---|---:|---:|
| Disk bytes | 11,678,184 | 13,064,434 |
| Vertices (STL duplicated) | 700,574 | 783,783 |
| Triangles | 233,562 | 261,287 |
| Dimensions (mm-ish) | 70.6 × 52.9 × 18.0 | 63.7 × 59.2 × 21.8 |
| Diagonal | 90.07 | 89.63 |
| Open/closed | **open** | **open** |
| Edge manifold | true | true |
| Vertex manifold | true | true |
| Watertight | **false** | **false** |
| Orientable | true | true |
| Connected components (raw STL) | ~233k (dup verts) | ~261k |
| After VTK clean verts | 118,085 | 131,779 |
| Self-intersection | deferred (runtime) | deferred |
| Approx buffer memory | ~19.6 MB | ~21.9 MB |

**Do not assume STL topology is a solid.** Vertex duplication in binary STL breaks naive connectivity.

---

## License matrix

| Library | Version | License | Commercial Use | Static/Dynamic/WASM | Production Candidate |
|---|---|---|---|---|---|
| Manifold (`manifold3d` / `manifold-3d`) | 3.5.3 | Apache-2.0 | Yes | Native + WASM | Solid ops only (not open-scan trim) |
| Open3D | 0.19.0 | MIT | Yes | Native / Python (no Studio link) | Validation + tensor plane clip (worker) |
| VTK | 9.7.0 | BSD-3-Clause | Yes | Native / Python (no Studio link) | Specialized clipping (worker) |
| Eigen | 3.4.x target | MPL-2.0 | Yes (file-level) | Header-only native | Math only — do not reinvent |
| Embree | 4.x eval | Apache-2.0 | Yes | Native | Only if beats Three.js picking (not measured win) |
| nanoflann | 1.5.x eval | BSD-2-Clause | Yes | Header-only | Deferred — CLN-008 SpatialIndex adequate |
| meshoptimizer | 0.21.x eval | MIT | Yes | Static/WASM | Display-only |
| CGAL | — | GPL/commercial | **Blocked** | — | Evaluation-only without legal approval |
| clinical-reference-v1 | 1.0.0 | Project | Yes | In-process TS | **Current browser authority** |

---

## Manifold

### Official capability review

| Capability | Evidence |
|---|---|
| Boolean difference / union / intersection | Control solids: PASS (~1–8 ms cube−sphere) |
| Split / SplitByPlane / TrimByPlane | Control cube TrimByPlane: PASS |
| RayCast | API present; not required for Trim contract |
| Manifold guarantees | Enforced — non-manifold input rejected |
| Parallel / pipelined | Documented by upstream; not the limiting factor here |
| WASM (`manifold-3d@3.5.3`) | Packaged in Studio **devDependencies** for future solid ops |
| Dental STL ingest | After merge-identical-vertices: **`Error.NotManifold`**, empty mesh (lower+upper) |

### Production judgment

Manifold is excellent for **closed manifold solids** and manufacturing-like Booleans. It is **not** an authoritative backend for open dental scan Trim/Close Base unless an explicit, validated solidification step is approved (that step changes authoritative geometry and was **not** applied silently).

---

## Open3D

| API / check | Result on dental fixtures |
|---|---|
| `is_edge_manifold` / `is_vertex_manifold` | true / true |
| `is_watertight` | false |
| `is_orientable` | true |
| `is_self_intersecting` | deferred on ~250k tris |
| Legacy `clip_plane` | **missing** on `geometry.TriangleMesh` |
| Tensor `clip_plane` | **PASS** — lower 233562→198767; upper 261287→85223; finite; edge manifold retained |
| `boolean_*` | **FAIL** — requires watertight; meshes open |
| `fill_holes` | Completes but **FAIL quality**: +233562 / +261287 tris, still non-watertight, ~48–53 s |

Safe preprocessing: vertex weld / clean for **inspection** only. Authoritative clinical geometry must not be silently repaired.

---

## VTK

| Filter | Result |
|---|---|
| `vtkClipPolyData` + plane | **PASS** — real cell cutting; lower p50 ~208 ms; upper p50 ~186 ms; nonzero delta; finite bounds |
| Box/implicit trim approx | Unstable (empty on lower; over-cut upper → 517 tris) — needs proper polygon cutter |
| `vtkCleanPolyData` + connectivity | Useful inspection (dedupe verts) |
| `vtkFillHolesFilter` | Modest adds (~2.2–2.5k tris @ holeSize=50); not a full clinical base pedestal |

VTK clipping behavior is **more appropriate than centroid/AABB whole-cell extraction** for plane cuts. Polygon-boundary Trim still needs an explicit cutter mapped to the clinical stroke contract.

**Must not** become the viewport renderer.

---

## Eigen / Embree / nanoflann / meshoptimizer

| Library | Verdict |
|---|---|
| Eigen | Use for native PCA/transforms; do not write another matrix library |
| Embree | Not integrated — no measured win vs Three.js raycaster + CLN-008 index |
| nanoflann | Not integrated — CLN-008 AABB/KD spatial index remains |
| meshoptimizer | Display/LOD only; never authoritative clinical mesh |

---

## Scoring matrix (weighted)

| Criterion | Weight | Manifold | Open3D | VTK | clinical-reference-v1 |
|---|---:|---:|---:|---:|---:|
| Trim correctness | 25 | 5 (open fail) | 14 (plane yes / polygon no) | 16 (plane yes / polygon partial) | 18 (polygon exact-edge; residual risk) |
| Close Base correctness | 20 | 4 | 4 (fill_holes fail) | 8 (fill modest) | 12 (capped; not industrial) |
| Topological robustness | 15 | 15 (solids) | 10 | 11 | 8 |
| Performance | 10 | 10 (solids) | 7 | 9 | 6 (main-thread JS) |
| Memory | 10 | 8 | 6 | 8 | 7 (caps) |
| Integration complexity | 5 | 4 (WASM ready) | 2 (native) | 2 (native) | 5 (already linked) |
| Cancellation/failure | 5 | 4 (hard refuse) | 3 | 3 | 4 (abort/caps) |
| Licensing | 5 | 5 | 5 | 5 | 5 |
| Maintainability | 5 | 4 | 4 | 4 | 3 |
| **Total** | **100** | **59** | **55** | **66** | **68** |

Justification: weights prioritize clinical Trim/Base correctness on **our** open scans over popularity. Scores are evidence-derived, not opinion.

---

## Fallback strategy (explicit — not silent chain)

1. **Primary browser Trim/Base:** `clinical-reference-v1` (`exact-edge-clip`, capped close-base)
2. **Specialized plane clipping (future worker):** VTK `vtkClipPolyData` **or** Open3D tensor `clip_plane` (parity observed)
3. **Validation-only:** Open3D quality checks (offline/worker)
4. **Solid Boolean / TrimByPlane (future closed solids):** Manifold WASM
5. **Prototypes disabled by default:** `centroid-polygon`, unbounded AABB extrude

Fallbacks are role-separated in `GeometryBackendPolicy.ts`. Adapters throw `UNSUPPORTED_OPERATION` rather than silently substituting algorithms.

---

## Selection rule outcome

See `docs/architecture/geometry-backend-decision.md`.
