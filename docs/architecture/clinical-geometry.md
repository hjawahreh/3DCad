# Clinical Geometry Architecture (CLN-008 / GEO-001)

## Pipeline

```text
Clinical Tool (trim / close-base)
  → Operation Runtime (OperationHost / CommitToken)
  → Geometry Services (family policy)
  → Kernel Bridge contract
  → ClinicalGeometryKernelBridge (studio composition root)
       ├── ClinicalGeometryEngine (GEO-001 façade)
       │     analyze / topology / BVH / SurfacePath / trim / base / repair
       ├── MeshRegistry (source / working / preview / display)
       ├── GeometryQualityPipeline
       ├── SpatialIndex + triangle BVH
       ├── GeometryCache
       └── HybridGeometryBackend
            ├── clinical-reference-v1
            └── vtk-http-worker-v1 (when healthy)
```

See `docs/architecture/GEO-001-clinical-geometry-engine-v2.md`.

Platform packages (`tool-runtime`, `geometry-services`, `kernel-bridge`, …) remain unmodified.

## Mesh roles

| Role | Mutability | Purpose |
|------|------------|---------|
| Source | Immutable | Original imported / seeded clinical mesh |
| Working | Commit-only | Authoritative clinical revision |
| Preview | Ephemeral | Non-destructive operation preview |
| Display | Derived | Rendering-oriented prep (never authoritative) |

## Backend strategy

GEO-001 keeps the hybrid backend policy. The Clinical Geometry Engine selects
backends by capability with explicit reasons — no silent unreliable fallback.

Native C++ adapters remain scaffolded under `kernel/include/cadstudio/geometry/`
and documented in `docs/architecture/third-party-geometry.md`.

## Invariants

1. Source mesh is never destroyed.
2. Preview never mutates document / working / history.
3. Failed operations produce no CommitToken, revision, or history.
4. Commit requires CommitToken from Operation Runtime.
5. React / clinical UI never execute mesh algorithms.
6. Display optimization never replaces clinical fidelity mesh.
7. Stale caches cannot be committed.
8. No undocumented native dependency.
9. Surface path points must associate to the mesh (no fabricated hits).
