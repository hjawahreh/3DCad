# Geometry Backend Benchmarks (PROD-001R)

**Generated:** 2026-09-11T18:15:43Z

Real dental fixtures (`upper.stl`, `lower.stl`). Solid cube controls validate Manifold APIs only.

## Environment

- Open3D: `0.19.0`
- VTK: `9.7.0`
- manifold3d: `3.5.3`

## Fixture inventory

### lower.stl

| Metric | Value |
|---|---|
| Disk bytes | 11678184 |
| Vertices | 700574 |
| Triangles | 233562 |
| Dimensions | [70.63642501831055, 52.89515686035156, 18.009108781814575] |
| Diagonal | 90.06514396681902 |
| Open/closed | open |
| Edge manifold | True |
| Vertex manifold | True |
| Watertight | False |
| Self-intersecting | deferred_large_mesh |
| Orientable | True |
| Components (raw STL) | 233506 |
| Approx memory | 19616520 |
| Topology check ms | 3931.0568489599973 |

### upper.stl

| Metric | Value |
|---|---|
| Disk bytes | 13064434 |
| Vertices | 783783 |
| Triangles | 261287 |
| Dimensions | [63.687246322631836, 59.18746566772461, 21.76161766052246] |
| Diagonal | 89.62583020274025 |
| Open/closed | open |
| Edge manifold | True |
| Vertex manifold | True |
| Watertight | False |
| Self-intersecting | deferred_large_mesh |
| Orientable | True |
| Components (raw STL) | 261248 |
| Approx memory | 21946236 |
| Topology check ms | 4117.540959035978 |

## Benchmarks

### control_solid

#### manifold_trim_boolean

- p50: **1.3589480658993125 ms**
- p95: **7.7295859809964895 ms**
- samples: `[7.7295859809964895, 1.2071039527654648, 1.3589480658993125]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"trim_tri": 12, "boolean_tri": 524, "trim_empty": false}`

### lower

#### open3d_clip_plane

- p50: **711.4142639329657 ms**
- p95: **742.1168650034815 ms**
- samples: `[671.9452460529283, 742.1168650034815, 711.4142639329657]`
- failure_rate: 1.0
- errors: `["run0: AttributeError: 'open3d.cpu.pybind.geometry.TriangleMesh' object has no attribute 'clip_plane'", "run1: AttributeError: 'open3d.cpu.pybind.geometry.TriangleMesh' object has no attribute 'clip_plane'", "run2: AttributeError: 'open3d.cpu.pybind.geometry.TriangleMesh' object has no attribute 'clip_plane'"]`
- result: `null`

#### open3d_boolean_difference

- p50: **1652.8814040357247 ms**
- p95: **1652.8814040357247 ms**
- samples: `[1652.8814040357247]`
- failure_rate: 1.0
- errors: `['run0: RuntimeError: boolean requires watertight input — mesh is open']`
- result: `null`

#### open3d_fill_holes

- p50: **48196.172080002725 ms**
- p95: **48196.172080002725 ms**
- samples: `[48196.172080002725]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"triangles_before": 233562, "triangles_after": 467124, "added": 233562, "watertight": false, "bounds": {"min": [-36.07221603393555, -22.992115020751953, -15.897418975830078], "max": [34.564208984375, 29.90304183959961, 2.111689805984497], "dimensions": [70.63642501831055, 52.89515686035156, 18.009108781814575], "diagonal": 90.06514396681902}}`

#### vtk_clip_plane

- p50: **208.39917089324445 ms**
- p95: **225.79690802376717 ms**
- samples: `[225.79690802376717, 205.38865705020726, 208.39917089324445]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"vertices": 100666, "triangles": 198767, "delta_triangles": 34795, "bounds": {"min": [-36.07221603393555, -22.992115020751953, -9.594230651855469], "max": [34.564208984375, 29.90304183959961, 2.111689805984497], "dimensions": [70.63642501831055, 52.89515686035156, 11.705920457839966], "diagonal": 89.01927169110002}}`

#### vtk_box_trim

- p50: **152.26140699815005 ms**
- p95: **157.59313490707427 ms**
- samples: `[145.36944299470633, 157.59313490707427, 152.26140699815005]`
- failure_rate: 1.0
- errors: `['run0: RuntimeError: empty after box trim', 'run1: RuntimeError: empty after box trim', 'run2: RuntimeError: empty after box trim']`
- result: `null`

#### vtk_clean_connectivity

- p50: **251.78510695695877 ms**
- p95: **251.78510695695877 ms**
- samples: `[248.60794201958925, 251.78510695695877]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"clean_vertices": 118085, "clean_cells": 233562, "largest_vertices": 118085, "largest_cells": 233561}`

#### manifold_ingest

- p50: **1429.625734104775 ms**
- p95: **1429.625734104775 ms**
- samples: `[1429.625734104775, 1377.7619429165497]`
- failure_rate: 1.0
- errors: `["run0: TypeError: __init__(): incompatible function arguments. The following argument types are supported:\n    1. __init__(self, vert_properties: ndarray[dtype=float32, shape=(*, *), order='C'], tri_verts: ndarray[dtype=uint32, shape=(*, 3), order='C'], merge_from_vert: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, merge_to_vert: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_index: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_original_id: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_transform: ndarray[dtype=float32, shape=(*, 4, 3), order='C'] | None = None, run_flags: ndarray[dtype=uint8, shape=(*), order='C'] | None = None, face_id: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, halfedge_tangent: ndarray[dtype=float32, shape=(*, 3, 4), order='C'] | None = None, tolerance: float = 0) -> None\n\nInvoked with types: manifold3d.Mesh", "run1: TypeError: __init__(): incompatible function arguments. The following argument types are supported:\n    1. __init__(self, vert_properties: ndarray[dtype=float32, shape=(*, *), order='C'], tri_verts: ndarray[dtype=uint32, shape=(*, 3), order='C'], merge_from_vert: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, merge_to_vert: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_index: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_original_id: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_transform: ndarray[dtype=float32, shape=(*, 4, 3), order='C'] | None = None, run_flags: ndarray[dtype=uint8, shape=(*), order='C'] | None = None, face_id: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, halfedge_tangent: ndarray[dtype=float32, shape=(*, 3, 4), order='C'] | None = None, tolerance: float = 0) -> None\n\nInvoked with types: manifold3d.Mesh"]`
- result: `null`

#### open3d_tensor_clip_plane

- p50: **2177.8693760279566 ms**
- p95: **2327.0549450535327 ms**
- samples: `[2161.951182060875, 2177.8693760279566, 2327.0549450535327]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"triangles_before": 233562, "triangles_after": 198767, "delta": 34795, "vertices": 100666, "finite": true, "watertight": false, "edge_manifold": true}`

#### manifold_ingest_status

- p50: **1746.6914979740977 ms**
- p95: **1746.6914979740977 ms**
- samples: `[1704.5007100095972, 1746.6914979740977]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"status": "Error.NotManifold", "num_tri": 0, "num_vert": 0, "is_empty": true, "ok": false}`

#### vtk_fill_holes

- p50: **332.91534101590514 ms**
- p95: **332.91534101590514 ms**
- samples: `[332.91534101590514]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"triangles_before": 233562, "triangles_after": 236034, "added": 2472}`

### upper

#### open3d_clip_plane

- p50: **827.2120519541204 ms**
- p95: **837.964691920206 ms**
- samples: `[837.964691920206, 827.2120519541204, 720.504334080033]`
- failure_rate: 1.0
- errors: `["run0: AttributeError: 'open3d.cpu.pybind.geometry.TriangleMesh' object has no attribute 'clip_plane'", "run1: AttributeError: 'open3d.cpu.pybind.geometry.TriangleMesh' object has no attribute 'clip_plane'", "run2: AttributeError: 'open3d.cpu.pybind.geometry.TriangleMesh' object has no attribute 'clip_plane'"]`
- result: `null`

#### open3d_boolean_difference

- p50: **1641.3093010196462 ms**
- p95: **1641.3093010196462 ms**
- samples: `[1641.3093010196462]`
- failure_rate: 1.0
- errors: `['run0: RuntimeError: boolean requires watertight input — mesh is open']`
- result: `null`

#### open3d_fill_holes

- p50: **53133.6821729783 ms**
- p95: **53133.6821729783 ms**
- samples: `[53133.6821729783]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"triangles_before": 261287, "triangles_after": 522574, "added": 261287, "watertight": false, "bounds": {"min": [-32.372676849365234, -27.040077209472656, -2.337831497192383], "max": [31.3145694732666, 32.14738845825195, 19.423786163330078], "dimensions": [63.687246322631836, 59.18746566772461, 21.76161766052246], "diagonal": 89.62583020274025}}`

#### vtk_clip_plane

- p50: **186.07199098914862 ms**
- p95: **201.14193891640753 ms**
- samples: `[201.14193891640753, 186.07199098914862, 178.159311064519]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"vertices": 45131, "triangles": 85223, "delta_triangles": 176064, "bounds": {"min": [-32.372676849365234, -26.489280700683594, 5.2787346839904785], "max": [31.294858932495117, 28.43121337890625, 19.423786163330078], "dimensions": [63.66753578186035, 54.920494079589844, 14.1450514793396], "diagonal": 85.26369839406392}}`

#### vtk_box_trim

- p50: **173.73933200724423 ms**
- p95: **174.32182596530765 ms**
- samples: `[159.15334096644074, 174.32182596530765, 173.73933200724423]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"vertices": 327, "triangles": 517, "delta_triangles": 260770, "geometry_changed": true}`

#### vtk_clean_connectivity

- p50: **289.64255994651467 ms**
- p95: **289.64255994651467 ms**
- samples: `[289.64255994651467, 250.5118070403114]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"clean_vertices": 131779, "clean_cells": 261287, "largest_vertices": 131779, "largest_cells": 261287}`

#### manifold_ingest

- p50: **1835.0953999906778 ms**
- p95: **1835.0953999906778 ms**
- samples: `[1728.7248990032822, 1835.0953999906778]`
- failure_rate: 1.0
- errors: `["run0: TypeError: __init__(): incompatible function arguments. The following argument types are supported:\n    1. __init__(self, vert_properties: ndarray[dtype=float32, shape=(*, *), order='C'], tri_verts: ndarray[dtype=uint32, shape=(*, 3), order='C'], merge_from_vert: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, merge_to_vert: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_index: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_original_id: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_transform: ndarray[dtype=float32, shape=(*, 4, 3), order='C'] | None = None, run_flags: ndarray[dtype=uint8, shape=(*), order='C'] | None = None, face_id: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, halfedge_tangent: ndarray[dtype=float32, shape=(*, 3, 4), order='C'] | None = None, tolerance: float = 0) -> None\n\nInvoked with types: manifold3d.Mesh", "run1: TypeError: __init__(): incompatible function arguments. The following argument types are supported:\n    1. __init__(self, vert_properties: ndarray[dtype=float32, shape=(*, *), order='C'], tri_verts: ndarray[dtype=uint32, shape=(*, 3), order='C'], merge_from_vert: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, merge_to_vert: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_index: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_original_id: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, run_transform: ndarray[dtype=float32, shape=(*, 4, 3), order='C'] | None = None, run_flags: ndarray[dtype=uint8, shape=(*), order='C'] | None = None, face_id: ndarray[dtype=uint32, shape=(*), order='C'] | None = None, halfedge_tangent: ndarray[dtype=float32, shape=(*, 3, 4), order='C'] | None = None, tolerance: float = 0) -> None\n\nInvoked with types: manifold3d.Mesh"]`
- result: `null`

#### open3d_tensor_clip_plane

- p50: **1728.3994070021436 ms**
- p95: **1747.6318719564006 ms**
- samples: `[1650.6325079826638, 1728.3994070021436, 1747.6318719564006]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"triangles_before": 261287, "triangles_after": 85223, "delta": 176064, "vertices": 45131, "finite": true, "watertight": false, "edge_manifold": true}`

#### manifold_ingest_status

- p50: **1914.0236478997394 ms**
- p95: **1914.0236478997394 ms**
- samples: `[1871.6392749920487, 1914.0236478997394]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"status": "Error.NotManifold", "num_tri": 0, "num_vert": 0, "is_empty": true, "ok": false}`

#### vtk_fill_holes

- p50: **289.09417300019413 ms**
- p95: **289.09417300019413 ms**
- samples: `[289.09417300019413]`
- failure_rate: 0.0
- errors: `[]`
- result: `{"triangles_before": 261287, "triangles_after": 263518, "added": 2231}`

## Notes

- Self-intersection full scan deferred on ~250k tris (unbounded runtime).
- Manifold ingest records merge-vertices helper; no silent clinical repair.
- AABB/centroid first-party trim is NOT a production-grade exact backend.
- Open3D legacy TriangleMesh has no clip_plane; tensor API clip_plane succeeds on open dental meshes.
- Manifold returns Error.NotManifold / empty for open dental STLs after vertex merge — no silent repair applied.

## Raw JSON

`docs/performance/geometry-backend-benchmarks.raw.json`
