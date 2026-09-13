# PROD-001R — Robust Geometry Backend Selection & Integration

**Status:** COMPLETE (evaluation + hybrid policy + adapters).  
**Single-backend production authority:** **UNRESOLVED** (hybrid interim).  
**PROD-002:** **BLOCKED** until blockers in decision doc are cleared.

**Date:** 2026-09-11

---

## Executive summary

Real dental fixtures (`upper.stl`, `lower.stl`) were inventoried and benchmarked against Manifold 3.5.3, Open3D 0.19.0, and VTK 9.7.0. Supporting libraries (Eigen, Embree, nanoflann, meshoptimizer) were reviewed against existing CLN-008 infrastructure.

**No single open-source backend passed all production selection rules** for in-browser clinical polygon Trim + Close Base on open scans. Evidence supports a **hybrid** policy with `clinical-reference-v1` remaining the Studio-linked authority, VTK/Open3D as specialized clipping/validation targets, and Manifold reserved for manifold solids.

---

## Current prototype failures

Documented in PROD-001 hardening; still the motivation for backend selection:

- Trim accept without visible cut (projection / centroid class failures)
- Close Base giant / malformed geometry
- Close Base main-thread freeze
- Over-reliance on AABB heuristics as if they were robust geometric ops

---

## Candidate backends & license matrix

See `docs/architecture/geometry-backend-evaluation.md` § License matrix.

---

## Real dental fixture results

| Fixture | Tris | Open | Watertight | Manifold ingest |
|---|---:|---|---|---|
| lower.stl | 233,562 | yes | no | `Error.NotManifold` (empty) |
| upper.stl | 261,287 | yes | no | `Error.NotManifold` (empty) |

---

## Trim benchmark

| Backend | Op | lower | upper | Notes |
|---|---|---|---|---|
| VTK | `vtkClipPolyData` plane | p50 **208 ms**, Δ34,795 tris | p50 **186 ms**, Δ176,064 tris | Real cell cutting |
| Open3D tensor | `clip_plane` | Δ34,795 tris (parity) | Δ176,064 tris (parity) | Legacy API missing `clip_plane` |
| Manifold | ingest + trim | **FAIL** NotManifold | **FAIL** NotManifold | Solids control PASS |
| clinical-reference | exact-edge-clip polygon | Covered by Vitest fixture suite | Covered by Vitest fixture suite | Browser authority |

Plane clip ≠ clinical polygon Trim. Polygon mapping remains a worker integration task for VTK/Open3D.

---

## Close Base benchmark

| Backend | Result |
|---|---|
| Open3D `fill_holes` | +233k / +261k tris, still non-watertight, ~48–53 s — **REJECT** |
| VTK `vtkFillHolesFilter` | +2.2–2.5k tris @ holeSize=50 — limited; not clinical pedestal |
| Manifold | N/A on open scans |
| clinical-reference capped plane/surface | Remains interim with hard ceilings |

---

## Quality / performance / memory / UI / cancellation

- Quality: Open3D manifold/watertight/orientability used for fixture inventory; full self-intersection deferred (unbounded cost on ~250k tris).
- Performance: recorded in `docs/performance/geometry-backend-benchmarks.md` + raw JSON.
- Memory: hard caps retained in close-base; reject triangle explosions (`MAX_OUTPUT_TRIS=2e6` in harness).
- UI: native libs must run off React/main thread via worker; Manifold WASM eligible only after solidification.
- Cancellation: orchestration-boundary cancel; backends that cannot interrupt must not commit partial geometry (existing Operation Runtime contract).

---

## Selected architecture

```text
Clinical Tool
  → Operation Runtime
  → Geometry Services
  → Kernel Bridge
  → GeometryBackend (injectable)
        ├─ clinical-reference-v1     [authoritative-browser]
        ├─ VtkClipAdapter            [scaffold — specialized clipping]
        ├─ Open3DAdapter             [scaffold — validation/clip]
        └─ ManifoldWasmAdapter       [solid-only; refuses open scans]
```

Policy: `GeometryBackendPolicy.ts`.  
Bridge: `ClinicalGeometryKernelBridge` accepts injectable `GeometryBackend`.

---

## Why hybrid / why others lost

See `docs/architecture/geometry-backend-decision.md`.

---

## Files changed (primary)

- `docs/architecture/geometry-backend-evaluation.md`
- `docs/architecture/geometry-backend-decision.md`
- `docs/architecture/third-party-geometry.md`
- `docs/performance/geometry-backend-benchmarks.md` (+ `.raw.json`)
- `docs/certification/PROD-001R-geometry-backend.md` (this file)
- `tools/geometry-backend-bench/bench_prod001r.py`
- `apps/studio/src/geometry-kernel/adapters/*Policy|Manifold|Vtk*`
- `apps/studio/src/geometry-kernel/ClinicalGeometryKernelBridge.ts` (injectable backend)
- `apps/studio/test/clinical/geometry/prod-001r-*.test.ts`

---

## Tests

- `pnpm --filter @cad-studio/studio test` (Clinical Vitest) — **232 passed**
- `pnpm --filter @cad-studio/studio typecheck` — **PASS**
- `pnpm --filter @cad-studio/studio build` — **PASS**
- `pnpm exec vitest run test/architecture.test.ts` — **PASS**
- Offline: `/tmp/cad-geom-bench/bin/python tools/geometry-backend-bench/bench_prod001r.py` — **PASS** (evidence JSON written)
- `pnpm deps:check` (dependency-cruiser) — **OOM** (~4 GB heap) — recorded; architecture Vitest not weakened
- `pnpm licenses:check` — fails on root package `UNLICENSED` (pre-existing); Manifold Apache-2.0 is allowlisted

## Browser verification

**Not claimed PASS.** Manual checklist still required:

1. Import upper → Orient → Prepare → Trim → draw → validate → accept → **visual hole**
2. Undo / Redo geometry
3. Close Base preview/accept without freeze
4. Save → reload → Open Case geometry match

Automated fixture trim/close bounds tests exist from PROD-001; they do not replace visual certification.

---

## Remaining blockers

1. No native/WASM worker for VTK/Open3D in Kernel Bridge
2. Polygon-boundary cutter not bound to VTK/Open3D
3. Close Base lacks an industrial backend that passes quality gates on open scans
4. Manual browser sign-off incomplete

---

## PROD-002 recommendation

**Do not start PROD-002** until decision blockers are cleared or an explicit exception is approved with signed browser proof for the interim `clinical-reference-v1` path.
