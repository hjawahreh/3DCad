# Clinical Geometry Architecture (CLN-008)

## Pipeline

```text
Clinical Tool (trim / close-base)
  → Operation Runtime (OperationHost / CommitToken)
  → Geometry Services (family policy)
  → Kernel Bridge contract
  → ClinicalGeometryKernelBridge (studio composition root)
       ├── MeshRegistry (source / working / preview / display)
       ├── GeometryQualityPipeline
       ├── SpatialIndex (AABB + KD-tree)
       ├── GeometryCache
       └── NativeReferenceBackend
            ├── trim (boundary centroid cut)
            ├── closeBase (plane / surface)
            └── prepareDisplay (non-authoritative)
```

Platform packages (`tool-runtime`, `geometry-services`, `kernel-bridge`, …) remain unmodified.

## Mesh roles

| Role | Mutability | Purpose |
|------|------------|---------|
| Source | Immutable | Original imported / seeded clinical mesh |
| Working | Commit-only | Authoritative clinical revision |
| Preview | Ephemeral | Non-destructive operation preview |
| Display | Derived | Rendering-oriented prep (never authoritative) |

## Backend strategy

CLN-008 ships a deterministic TypeScript **clinical reference kernel** behind `KernelBridge`.

Native C++ adapters (Open3D, Eigen, nanoflann, meshoptimizer, TBB) are scaffolded under `kernel/include/cadstudio/geometry/` and documented in `docs/architecture/third-party-geometry.md`. They are not production-linked in this milestone.

## Invariants

1. Source mesh is never destroyed.
2. Preview never mutates document / working / history.
3. Failed operations produce no CommitToken, revision, or history.
4. Commit requires CommitToken from Operation Runtime.
5. React / clinical UI never execute mesh algorithms.
6. Display optimization never replaces clinical fidelity mesh.
7. Stale caches cannot be committed.
8. No undocumented native dependency.
