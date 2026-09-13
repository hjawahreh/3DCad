# Third-Party Geometry Dependencies

Every geometry-related third-party dependency introduced or evaluated is recorded here. Undocumented native dependencies are forbidden.

## Production use (Studio-linked)

| Name | Version | Repository | Purpose | License | Linkage | Production use | Source modified | Redistribution | Reason |
|------|---------|------------|---------|---------|---------|----------------|-----------------|----------------|--------|
| Clinical Reference Kernel (studio) | 1.0.0 | `apps/studio/src/geometry-kernel/` | Deterministic polygon trim (`exact-edge-clip`), capped close-base, quality, spatial index behind `KernelBridge` | Project license | In-process TS | **Yes** — authoritative browser backend (PROD-001R interim) | N/A (first-party) | With product | Only in-browser backend that implements clinical polygon Trim today |
| `@cad-studio/kernel-bridge` | workspace | `packages/kernel-bridge` | Opaque handles, session, capabilities | Project license | TS package | Yes | No | With product | Frozen contract |

## PROD-001R evaluated (not Studio-linked as authority)

| Name | Version | Repository | Purpose | License | Linkage | Production use | Source modified | Redistribution | Reason |
|------|---------|------------|---------|---------|---------|----------------|-----------------|----------------|--------|
| Manifold (`manifold-3d` / `manifold3d`) | 3.5.3 | https://github.com/elalish/manifold | Solid Boolean / TrimByPlane / Split; WASM candidate for closed solids | Apache-2.0 | npm devDependency + Python eval | **No** — open dental STLs → `NotManifold` | No | Apache notice | Strong solids engine; unsuitable for open-scan Trim without explicit solidification |
| Open3D | 0.19.0 | https://github.com/isl-org/Open3D | Tensor `clip_plane`, quality checks, fill_holes eval | MIT | Offline Python harness / C++ scaffold | **No** (scaffold `Open3DAdapter`) | No | MIT notice | Plane-clip parity with VTK; Booleans need watertight; fill_holes failed gates |
| VTK | 9.7.0 | https://vtk.org | Clinical Trim (`vtkImplicitSelectionLoop`+`vtkClipPolyData`) and Close Base (`vtkContourTriangulator`+`vtkLinearExtrusionFilter`) via HTTP sidecar | BSD-3-Clause | `vtk_worker_http.py` + `VtkHttpWorkerBackend` / `HybridGeometryBackend` | **Candidate** — enabled when sidecar healthy; interactive browser sign-off pending | No | BSD notice | Never on UI thread; never in React/clinical imports |
| Eigen | 3.4.x (target) | https://gitlab.com/libeigen/eigen | Vectors, matrices, transforms, PCA | MPL-2.0 | Header-only native policy | **No** (policy header only) | No | MPL-2.0 file-level | Do not reinvent linear algebra |
| Embree | 4.x (eval) | https://www.embree.org | Ray queries / picking acceleration | Apache-2.0 | — | **No** | No | Apache notice | Integrate only if measured win vs Three.js + CLN-008 index |
| nanoflann | 1.5.x (eval) | https://github.com/jlblancoc/nanoflann | NN / spatial queries | BSD-2-Clause | Header-only | **No** | No | BSD notice | CLN-008 SpatialIndex remains |
| meshoptimizer | 0.21.x (target) | https://github.com/zeux/meshoptimizer | Display index/vertex optimization | MIT | Optional npm | **No** (display-only path) | No | MIT notice | Must never alter authoritative clinical geometry |
| oneTBB | 2021.x (target) | https://github.com/oneapi-src/oneTBB | Parallel mesh traversal | Apache-2.0 | Dynamic/static | **No** | No | Apache notice | Parallelism must preserve determinism |
| robin-map | 1.3.x (target) | https://github.com/Tessil/robin-map | Hot-path native hash maps | MIT | Header-only | **No** | No | MIT notice | Only where profiling shows value |
| CGAL | — | https://www.cgal.org | Algorithmic reference | **GPL / LGPL / commercial** | — | **Forbidden without license review** | — | GPL implications | Evaluation-only |

## License gate

Repository `licenses:check` allows: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0.

CGAL GPL components are **not** approved for production linking.

## Architectural boundary

```text
Clinical Tool
  → Operation Runtime
  → Geometry Services
  → Kernel Bridge
  → ClinicalGeometryKernelBridge
       → GeometryBackend (clinical-reference-v1 | future VTK/Open3D/Manifold adapters)
```

Open3D, VTK, Manifold, Eigen, meshoptimizer, and nanoflann types must never appear in React, clinical workflow contracts, or Geometry Services public APIs.

## PROD-001T decision pointer

- Certification: `docs/certification/PROD-001T-vtk-integration.md`
- Browser shots: `docs/certification/prod-001t-browser-shots/`
- HTTP worker: `tools/geometry-backend-bench/vtk_worker_http.py`
- Adapters: `VtkHttpWorkerBackend`, `HybridGeometryBackend`
- Loop builder: `apps/studio/src/clinical/trim/ClinicalTrimLoop3d.ts`

## PROD-001S decision pointer

- Spike performance: `docs/performance/prod-001s-vtk-spike.md`
- Spike certification: `docs/certification/PROD-001S-vtk-clinical-spike.md`
- Worker: `tools/geometry-backend-bench/vtk_clinical_spike.py`
- Adapter: `apps/studio/src/geometry-kernel/adapters/VtkNativeWorkerBackend.ts` (Node/Vitest only)

## PROD-001R decision pointer

- Evaluation: `docs/architecture/geometry-backend-evaluation.md`
- Decision: `docs/architecture/geometry-backend-decision.md`
- Benchmarks: `docs/performance/geometry-backend-benchmarks.md`
- Certification: `docs/certification/PROD-001R-geometry-backend.md`
