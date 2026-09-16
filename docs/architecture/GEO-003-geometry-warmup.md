# GEO-003 — Geometry Warmup + Editing Readiness

## Baseline

| Metric | GEO-002 |
| --- | --- |
| Native Trim cold | ~2.7–4.2 s |
| Native Trim warm | ~2.4–2.6 s |
| First SurfacePath / clinical spatial cold | ~9–10 s |

Geometry correctness unchanged (`geo:947c05f2` for the deterministic real-upper Trim).

## Warmup Lifecycle

```
Import → Normalize → Orientation → Prepare
  → Geometry Warmup (background)
       WARMING → READY | FAILED
```

Triggers:

1. **After Prepare** (`ClinicalPreparationController.autoPrepare`) — primary
2. **Case reopen** when `preparationMeta` is ready/warning
3. **Trim enter** soft kick if context missing
4. **After Trim Accept / Undo / Redo** — invalidate + async rewarm

## Context

`ClinicalGeometryContext` gains:

- `readyState`: `NOT_READY | WARMING | READY | FAILED`
- `clinicalSpatial`, `topology`, `workerSessionId`, `warmupTimings`

`GeometryWarmupService` (`geometryWarmup`) owns readiness, cancellation, eviction (max 8 entries), and stage timings.

## Cache

Warm content (only):

- ClinicalGeometryContext
- topology (via clinical spatial)
- clinical spatial / BVH
- backend mesh session (`ensureGeometry`) when worker available

Not warmed:

- SurfacePath
- Trim preview results

Fingerprint mismatch → `INVALIDATED` → new warm.

## Worker

Persistent VTK session reused via `ensureGeometry` / `ensureVtkGeometry`.
Backend warm is best-effort: spatial READY still enables editing if the worker is temporarily down.

Worker restart: session miss on next ensure; Trim enter / Prepare retry re-warms without corrupting the clinical document.

## UPPER / LOWER / BOTH

Contexts are keyed by `objectId` (+ fingerprint). BOTH does **not** merge meshes into one BVH. Arch switch selects the other READY context.

## Performance

Warmup records:

- `topologyMs`, `spatialIndexMs`, `backendMs`, `totalWarmupMs`

Spatial build remains the dominant warm cost (~9–10 s on 261k faces) but runs **before** the clinician draws.

## First Trim After Warmup

After READY:

- `buildClinicalSpatialIndex` is a fingerprint cache HIT (&lt;50 ms)
- SurfacePath no longer pays cold BVH
- Native Trim approaches GEO-002 warm (~2.4–2.6 s class)

## Warm Trim

Same fingerprint → no unexpected reinitialization between Preview B/C.

## Geometry Equivalence

Deterministic Trim fingerprint must equal GEO-002 / GEO-001H: `geo:947c05f2`.

## Memory

Ownership:

| Asset | Owner |
| --- | --- |
| ClinicalMesh | MeshRegistry |
| Topology / ClinicalSpatial | fingerprint `spatialCache` + context refs |
| VTK mesh | worker session |
| Preview | single active preview per session (GEO-001F/H) |

Case switch / close → `geometryWarmup.invalidateAll()`.

## Browser Evidence

Playwright continues Import → Orientation → Prepare → Trim.
UI readiness: Trim Polyline/Freehand disabled until READY; status shows “Preparing editing tools…”.
Production timing uses node-host / tauri-ipc, not Chromium HTTP.

## Automated Tests

`test/clinical/geometry/geo-003-geometry-warmup.test.ts`

## Remaining Bottlenecks

1. Warmup spatial build itself (~9–10 s) still runs on the main thread — moved off first edit, not eliminated.
2. Native VTK Trim warm floor (~0.5–2.6 s) unchanged from GEO-002.

## Certification

See `docs/certification/GEO-003-geometry-warmup.md`.
