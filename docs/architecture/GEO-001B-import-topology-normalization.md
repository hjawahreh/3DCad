# GEO-001B

## Root Cause

GEO-001A failed because real clinical STL imports preserve **triangle soup**
buffers: each triangle stores three unique vertex indices even when coordinates
coincide. Index-based `TopologyGraph` / `MeshQualityReport` then treat every
triangle as an independent connected component.

That breaks face adjacency, surface paths, boundary extraction, Trim, and Close
Base — without any change to SurfacePath validation rules.

## Raw Mesh Characteristics

Authoritative fixtures (`apps/studio/public/clinical-fixtures/{upper,lower}.stl`):

| Arch | Triangles | Vertices (raw) | Components (raw) | Boundary edges (raw) |
|---|---:|---:|---:|---:|
| Upper | 261 287 | 783 861 (= 3×tris) | 261 287 | 783 861 |
| Lower | 233 562 | 700 686 | 233 562 | 700 686 |

Primary “boundary” on raw import was a **single triangle** (~1.8 mm).

## Welding Strategy

Canonical pipeline:

```
STL/OBJ/PLY parse → raw SOURCE mesh (immutable)
                 → normalizeMeshTopology()
                 → WORKING ClinicalMesh (indexed)
                 → quality / ClinicalGeometryEngine
```

Normalization lives in the geometry kernel
(`TopologyNormalization.ts`) and is applied once at the import/hydrate boundary
(`registerParsedClinicalMeshWithReport`). Trim / Close Base / Segmentation do
**not** re-implement welding.

## Exact Welding

Default `TopologyWeldPolicy`:

- `mode: EXACT`
- `absoluteTolerance: 0`

Algorithm:

1. Deterministic exact duplicate weld keyed by IEEE-754 float32 bit patterns
2. Drop unused / non-finite verts
3. Drop degenerate triangles after remapping
4. Drop exact duplicate triangles (winding-independent key)
5. Rebuild topology metrics
6. Record `TopologyNormalizationReport`

Fingerprints are deterministic (insertion order = first-occurrence canonical).

## Near Welding

`mode: CONSERVATIVE` with an **explicit absoluteTolerance (mm)** is implemented
but **not** used by default clinical import.

Rules:

- Never a silent bbox-fraction tolerance
- Prefer DISCONNECTED over over-welding
- Deviation stats (`max` / `mean` / `p95`) recorded; optional
  `maxAllowedDeviationMm` rejects the weld

Real fixtures weld fully under EXACT — conservative near-weld was not required.

## Tolerance Policy

`TopologyWeldPolicy` is the only authority. Import uses
`DEFAULT_TOPOLOGY_WELD_POLICY` (EXACT / 0 mm).

## Topology Results

Upper after EXACT weld (evidence JSON):

| Metric | Before | After |
|---|---:|---:|
| Vertices | 783 861 | 131 779 |
| Components | 261 287 | **1** |
| Boundary edges | 783 861 | **2 273** |
| Exact duplicates removed | — | 652 082 |
| Duration | — | ~9.9 s |

## Boundary Results

Primary boundary after normalization (upper):

- point count: **2 273** (was 3)
- perimeter: **~350.7 mm** (was ~1.8 mm)
- projected area: **~1369 mm²**

This is a realistic open dental border — diagnostic gate for Close Base, not
base construction certification.

## Real Dental Evidence

- Offline: `docs/certification/geo-001b-evidence/normalization.json`
- Tests: `geo-001b-topology-normalization.test.ts`
- GEO-001A SurfacePath failure mode re-tested on welded upper (same-component path)

## Performance

Measured on real upper (~261k triangles): exact weld + cleanup + topology ≈
**10 s** in Node vitest (correctness-first; not prematurely optimized).

## Risks

- Persistence must keep SOURCE separate when present; WORKING is what clinical
  ops mutate. Dual buffers are optional on save for reopen fidelity.
- Duplicate-triangle removal uses winding-independent keys — intentional for soup
  cleanup; already-indexed meshes remain no-ops when no dups exist.
- Visual identity is coordinate-preserving for EXACT weld (maxDeviation = 0).

## Remaining Issues

- Full Close Base visual certification still deferred (GEO-001A §26 / GEO-001B §29).
- Reference close-base ear-clip/walls limitation remains after topology pass.
- GEO-001A browser Trim retest should be run against Studio with this import path.

## Certification

**PASS WITH OBSERVATIONS**

- Topology foundation for real imports: **PASS**
- SurfacePath same-component traversal on welded upper: **PASS** (unit)
- Close Base construction: **NOT CERTIFIED** (boundary diagnostic only)
- Clinical certification: **NOT CLAIMED**
- Movement: **NOT STARTED**
