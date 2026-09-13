# GEO-001 Clinical Geometry Engine V2

## Problem

Trim and Close Base treated as isolated lasso/clip and AABB extrusion recipes
produced visually unacceptable clinical geometry despite shallow automated
success. Production dental CAD needs a reusable surface-aware, topology-aware,
deterministically validated geometry core.

## Existing Architecture Preserved

```text
Clinical UI
  → Clinical Application
  → Operation Runtime (CommitToken)
  → Geometry Services
  → Kernel Bridge
  → ClinicalGeometryEngine / geometry-kernel / native worker
```

No React VTK. No MeshRegistry mutation from UI. No platform redesign.
Source / working / preview / display roles, undo/redo, persistence, arch
isolation, preview/commit separation remain intact.

## Geometry Representation

`TriangleMesh` remains the authoritative buffer model.
`ClinicalMesh` wraps it with units (`mm`), coordinate frame (`mesh-local`),
optional arch, revision, and fingerprint — without duplicating buffers.

## Topology

`buildTopology()` produces a cached triangle adjacency graph:

- face neighbors
- edge→faces
- vertex→faces
- connected components
- boundary edges
- non-manifold edges
- ranked boundary loop candidates (`extractBoundaryLoops`)

Caches invalidate by mesh fingerprint.

## Spatial Index

`buildClinicalSpatialIndex()` combines:

- existing vertex KD-tree (`SpatialIndex`)
- deterministic triangle AABB BVH for ray queries

Supports ray intersection and nearest-surface queries without a new third-party
library.

## Surface Path

`SurfacePath` is a 3D surface-associated sample sequence (not a screen polyline):

- `createSurfacePath` / `validateSurfacePath` / `resampleSurfacePath`
- `closeSurfacePath` / `measureSurfacePath`
- geodesic reconstruction via face dual Dijkstra when jumps exceed threshold

Validation rejects off-surface, stale fingerprint, disconnected components,
duplicate consecutive samples, excessive jumps, and self-intersecting closures.

## Trim Engine

`ClinicalTrimEngine` / `ClinicalGeometryEngine.trim()`:

1. validate closed `SurfacePath`
2. select backend capability (`TRIM_CLIPPING`) with explicit reason
3. run Hybrid/VTK SelectPolyData+Clip or reference exact-edge-clip
4. safe repair cleanup
5. MeshQualityReport gate + region mismatch rejection

VTK Dijkstra remains the preferred selection path when the worker is healthy.
Unavailable VTK is an **explicit** fallback to clinical-reference — never silent.

## Boundary Extraction

Open boundary loops are extracted from topology and ranked by perimeter /
projected area / clinical-axis affinity. Close Base must not invent a border
from the full AABB alone.

## Base Engine

`ClinicalBaseEngine` / `ClinicalGeometryEngine.createBase()`:

1. extract + rank dental border
2. construct via existing close-base backend (plane/surface/offset)
3. prefer clinical base normal when provided
4. quality-gate output (area explosion / disconnection / no-op rejected)

AABB-shortest extrusion remains an interim construction detail inside the
reference backend until worker triangulation is fully certified — the engine
authority is boundary-first selection + validation.

## Backend Policy

`selectBackendForCapability()` maps:

| Capability | Preference |
|---|---|
| TRIM_SURFACE_SELECTION / TRIM_CLIPPING | VTK HTTP worker → clinical-reference |
| BOUNDARY_EXTRACTION / MESH_REPAIR / VALIDATION | clinical-reference |
| BASE_GENERATION | VTK close-base → clinical-reference |
| SOLID_BOOLEAN | Manifold only when contract satisfied |

## Validation

`analyzeMesh()` → `MeshQualityReport` with gate `PASS | WARNING | FAIL`.
Does not fabricate watertight/volume for open scans.
Structured `GeometryDiagnostics` accompany failed operations.

## Real Dental Fixtures

- `apps/studio/public/clinical-fixtures/upper.stl`
- `apps/studio/public/clinical-fixtures/lower.stl`
- `test/clinical/geometry/clinical-geometry-fixtures/README.md`

## Performance

Measured in unit suite on synthetic open surfaces and planar grids.
Real-mesh timing remains a browser certification concern (picker / BVH / VTK).

## Integration

- `ClinicalGeometryKernelBridge` owns a `ClinicalGeometryEngine` instance
- Trim: SurfacePath association before kernel invoke (controller + bridge)
- Close Base: boundary extraction gate before kernel invoke
- UI remains Operation Runtime consumer

## Known Limitations

1. Reference close-base still uses capped ear-clip / wall construction internally.
2. Full STL decode for engine unit tests stays in clinical import (not duplicated).
3. Aggressive geodesic reconstruction on 100k+ face meshes needs continued profiling.
4. Visual golden snapshots for Trim/Base preview are not yet automated image diffs.
5. Movement / AI segmentation intentionally out of scope.

## Certification

| Level | Status |
|---|---|
| ENGINE PASS | Targeted — APIs + unit suite green |
| REAL-DENTAL PASS | Observations — fixtures present; full visual cut/base certification deferred |
| BROWSER PASS | Not claimed in this milestone document alone |
| CLINICAL CERTIFICATION | **Not claimed** |
