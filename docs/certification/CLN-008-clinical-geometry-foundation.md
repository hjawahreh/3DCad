# Release Certification Report

**Milestone:** CLN-008 — Clinical Geometry Foundation Reimplementation  
**Package(s):** `apps/studio/src/geometry-kernel`, `apps/studio/src/clinical/{geometry,trim,close-base}`, `kernel/include/cadstudio/geometry` (scaffold)  
**Stability target:** Experimental → Production-oriented clinical geometry foundation  
**Author:** platform engineering  
**Date:** 2026-09-10  

---

## Scope

What was implemented:

- [x] Production Trim with real cut geometry (preview + commit)
- [x] Production Close Base with plane / offset / surface strategies
- [x] Authoritative Source / Working / Preview / Display mesh roles
- [x] Geometry quality pipeline, spatial index, cache invalidation
- [x] Studio-owned `ClinicalGeometryKernelBridge` behind frozen KernelBridge
- [x] Third-party license manifest + C++ Open3D/Eigen scaffolding
- [x] Determinism tests, fuzz smoke, benchmark smoke
- [x] Documentation under `docs/clinical`, `docs/architecture`, `docs/performance`

Segmentation, tooth ID, biomechanics, and treatment planning remain out of scope.

## Architecture

```text
Clinical Tool → Operation Runtime → Geometry Services → Kernel Bridge
  → ClinicalGeometryKernelBridge (composition root)
  → NativeReferenceBackend (trim / closeBase / display / quality / spatial)
```

Platform packages were **not** modified. Studio composition root swaps `MockKernelBridge` for `ClinicalGeometryKernelBridge`.

## Third-party libraries

See `docs/architecture/third-party-geometry.md`.

| Dependency | Production use |
|------------|----------------|
| Clinical reference kernel (first-party TS) | Yes |
| Open3D / Eigen / meshoptimizer / nanoflann / TBB / robin-map | Evaluated / scaffolded — not linked |
| CGAL | Forbidden without license review |

## Trim

- Algorithm: polygonal boundary projection + centroid classification (remove interior)
- Validation: clinical boundary checks + kernel quality
- Preview: real retained mesh (preview role)
- Commit: CommitToken → descriptor metadata (counts, fingerprint, backend)
- History: snapshot undo/redo

## Close Base

- Strategies: plane, offset, surface
- Pipeline: boundary → strategy → preview → validate → commit
- History: snapshot undo/redo with strategy label

## Performance

Benchmark smoke (`geometry-benchmarks.test.ts`, 2026-09-10 sample):

| Size | Vertices | Triangles | Preprocess median (ms) | Spatial median | Trim median | Close Base median | Display median | Peak mem est. (B) |
|------|----------|-----------|------------------------|----------------|-------------|-------------------|----------------|-------------------|
| small | 81 | 128 | 2.3 | 0.7 | 2.2 | 7.1 | 0.9 | 2508 |
| medium | 625 | 1152 | 12.5 | 5.1 | 6.7 | 10.0 | 3.6 | 21324 |
| large | 2401 | 4608 | 12.1 | 8.2 | 15.8 | 24.9 | 16.5 | 84108 |

Timings are machine-dependent smoke measurements; not CI gates.

## Determinism

Identical source mesh + operation + parameters + backend version → identical `geo:` fingerprints (covered by geometry-kernel determinism tests).

## Tests

Commands / evidence (2026-09-10):

```bash
pnpm --filter @cad-studio/studio typecheck
  → exit 0

pnpm --filter @cad-studio/studio test
  → Test Files  11 passed (11)
  → Tests  103 passed (103)
  → includes:
     - test/clinical/trim.test.ts (13)
     - test/clinical/close-base.test.ts (19)
     - test/clinical/geometry/geometry-kernel.test.ts (10)
     - test/clinical/geometry/geometry-benchmarks.test.ts (2)

pnpm --filter @cad-studio/studio build
  → tsc -b && vite build → exit 0
```

## Architecture compliance

- [x] No platform package source changes for this milestone (`packages/*` contracts unchanged)
- [x] Clinical UI does not call KernelBridge `.invoke` / mesh algorithms
- [x] Geometry path remains Operation Runtime → Geometry Services → Bridge
- [x] Display mesh distinct from clinical fidelity mesh
- [x] Failed ops do not mutate document / history
- [x] Composition root binds `ClinicalGeometryKernelBridge`

## Known limitations

- Exact triangle clipping along boundary edges not yet implemented (centroid classification).
- Open3D/Eigen native backends are scaffolded, not production-linked.
- Remesh is intentionally no-op for protected clinical surfaces in CLN-008.
- Screen→mesh projection uses a fixed virtual 640×480 mapping.

## Certification status

**PASS WITH OBSERVATIONS**

Observations: native Open3D linking and exact boundary clipping remain follow-ups; the clinical reference kernel provides real, deterministic, reversible geometry for Trim and Close Base and establishes the reusable foundation for future segmentation and biomechanics.
