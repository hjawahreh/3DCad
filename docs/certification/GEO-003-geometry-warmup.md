# GEO-003

## Baseline

| | GEO-002 |
| --- | --- |
| Trim cold | ~2.7–4.2 s |
| Trim warm | ~2.4–2.6 s |
| Clinical spatial cold (first SurfacePath) | ~9–10 s |

## Warmup Lifecycle

Prepare / case reopen / Trim enter soft-kick → `GeometryWarmupService.warmMesh` → `READY`.

Mutation (Accept / Undo / Redo) → invalidate + async rewarm.

## Context

`ClinicalGeometryContext` + `geometryWarmup` readiness: `NOT_READY | WARMING | READY | FAILED`.

## Cache

Topology + clinical spatial + backend session reused by fingerprint. SurfacePath / Trim preview not precomputed.

## Worker

`ensureGeometry` during warmup when available; persistent session retained. Backend failure does not block spatial READY.

## UPPER / LOWER / BOTH

Independent `objectId` contexts. BOTH does not merge BVHs.

## Performance

Real upper (261k faces), node-host evidence:

| Stage | ms |
| --- | --- |
| warmupTotalMs | **10767** |
| topologyMs / spatialIndexMs | **~10268** |
| backendMs | **~491** |
| spatHit after READY | **~0.009** |
| first Trim after warmup (trimAMs) | **3475** |
| second Trim (trimBMs) | **2257** |

vs GEO-002 cold Trim (~4200 ms): first Trim after warmup is faster and **does not** rebuild spatial (~0 ms HIT).

## First Trim After Warmup

**PASS** — spatial cold moved to Prepare warmup; first Trim no longer pays 9–10 s BVH.

## Warm Trim

B/C reuse resident mesh + warm context.

## Geometry Equivalence

`fp = geo:947c05f2` (matches GEO-001H / GEO-002).

## Memory

Case switch → `invalidateAll()`. Max 8 warm entries with eviction.

## Browser Evidence

Trim drawing disabled until READY; status “Preparing editing tools…”. Playwright path unchanged; timing certified via node-host.

## Automated Tests

`geo-003-geometry-warmup.test.ts` — 10/10 passed (lifecycle + live worker).

## Remaining Bottlenecks

1. Warmup spatial build (~10 s) still main-thread — deferred, not removed.
2. Native Trim warm floor (~2.3–3.5 s) remains a VTK/worker cost (GEO-002).

## Certification

**PASS WITH OBSERVATIONS**

- Case-level warmup works
- First Trim after warmup near warm class; spatial HIT proven
- Context reuse / invalidation / UPPER·LOWER isolation covered by tests
- Geometry fingerprint identical
- Base handoff unchanged (no Close Base redesign)

DO NOT CLAIM CLINICAL CERTIFICATION.
