# Third-Party Geometry Dependencies (CLN-008)

Every geometry-related third-party dependency introduced or evaluated during CLN-008 is recorded here. Undocumented native dependencies are forbidden.

## Production use (CLN-008)

| Name | Version | Repository | Purpose | License | Linkage | Production use | Source modified | Redistribution | Reason |
|------|---------|------------|---------|---------|---------|----------------|-----------------|----------------|--------|
| Clinical Reference Kernel (studio) | 1.0.0 | `apps/studio/src/geometry-kernel/` | Deterministic trim, close-base, quality, spatial index behind `KernelBridge` | Project license | In-process TS (composition root) | **Yes** — active `KernelBridge` | N/A (first-party) | With product | Real geometry without blocking on C++ Open3D link; replaceable by native adapters |
| `@cad-studio/kernel-bridge` | workspace | `packages/kernel-bridge` | Opaque handles, session, capabilities | Project license | TS package | Yes | No | With product | Frozen contract |

## Evaluated / scaffolded (not production-linked in CLN-008)

| Name | Version | Repository | Purpose | License | Linkage | Production use | Source modified | Redistribution | Reason |
|------|---------|------------|---------|---------|---------|----------------|-----------------|----------------|--------|
| Open3D | 0.18.x (target) | https://github.com/isl-org/Open3D | Mesh validation, normals, sampling, KD-tree, registration foundations | MIT | Static/dynamic C++ adapter | **No** (scaffold only) | No | MIT notice | Preferred native mesh backend; headers under `kernel/include/cadstudio/geometry/Open3DAdapter.hpp` |
| Eigen | 3.4.x (target) | https://gitlab.com/libeigen/eigen | Vectors, matrices, transforms, least-squares | MPL-2.0 | Header-only | **No** (policy header only) | No | MPL-2.0 file-level | Numerical geometry; do not reinvent linear algebra |
| meshoptimizer | 0.21.x (target) | https://github.com/zeux/meshoptimizer | Display-mesh index/vertex optimization, safe simplification | MIT | Static / optional npm | **No** (evaluated; display-only path) | No | MIT notice | Rendering prep must not replace clinical mesh |
| nanoflann | 1.5.x (target) | https://github.com/jlblancoc/nanoflann | Nearest-neighbour / spatial queries | BSD-2-Clause | Header-only | **No** (evaluated) | No | BSD notice | Preferred native NN; JS BVH used in reference kernel |
| oneTBB | 2021.x (target) | https://github.com/oneapi-src/oneTBB | Parallel mesh traversal | Apache-2.0 | Dynamic/static | **No** (evaluated) | No | Apache notice | Parallelism must preserve determinism |
| robin-map | 1.3.x (target) | https://github.com/Tessil/robin-map | Hot-path native hash maps | MIT | Header-only | **No** (evaluated) | No | MIT notice | Only where profiling shows value |
| CGAL | — | https://www.cgal.org | Algorithmic reference / optional backend | **GPL / LGPL / commercial** | — | **Forbidden without license review** | — | GPL implications | May be used as reference only; must not be embedded blindly |

## License gate

Repository `licenses:check` allows: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0.

CGAL GPL components are **not** approved for production linking.

## Architectural boundary

```text
Clinical Tool
  → Operation Runtime
  → Geometry Services
  → Kernel Bridge
  → ClinicalGeometryKernelBridge (CLN-008 reference) | future Native/Open3D
```

Open3D, Eigen, meshoptimizer, and nanoflann types must never appear in React, clinical workflow contracts, or Geometry Services public APIs.

## CLN-010 Clinical Analysis

No new third-party geometry libraries were added. Analysis reuses:

- `@cad-studio/camera-runtime` vector math (existing)
- CLN-008 `SpatialIndex` / mesh registry
- First-party PCA / least-squares / Dijkstra implementations in `apps/studio/src/clinical/analysis/`
