# GEO-002 — Native Clinical Geometry Performance

Reusable surface-operation layer + measured native latency reduction on top of
GEO-001B…H. **Not clinical certification.**

## Baseline

| Source | Metric | Value |
| --- | --- | --- |
| GEO-001H node-host | `baselineTrimMs` | **10567.99 ms** |
| Fingerprint | deterministic upper trim | `geo:947c05f2` |
| Fixture | upper.stl | 261287 faces |

## Performance Profile

| Stage | GEO-001H | GEO-002 |
| --- | --- | --- |
| Trim A (node-host) | ~10568 ms | **~2.7–4.2 s (−60–75%)** |
| Trim B / C (warm) | — | **~2.4–3.2 s** |
| VTK httpRoundTrip A | ~8–9 s | **~0.5–1.0 s** |
| SurfacePath cold | — | ~9.8 s (cached after) |
| CGF1 decode | — | ~0.2 ms |

Root causes removed from the hot path:

1. Full-mesh Python point-in-polygon scan (`loop_intersects_removable_region`)
2. Full input `poly_to_arrays` solely for area metrics
3. Duplicate `vtkTriangleFilter` + slow cell extract in export
4. Bridge: Level-2 quality + KD rebuild + input clone on every preview

## ClinicalGeometryContext

`context/ClinicalGeometryContext.ts` — fingerprint-scoped HIT/MISS/INVALIDATED.

## Cache Strategy

| Structure | Policy |
| --- | --- |
| Quality report | Cached; preview Level-1 |
| Bridge KD-tree | Skipped for VTK `loop3d` preview |
| VTK poly | Session-resident (GEO-001F) |
| Clinical spatial | Fingerprint cache (SurfacePath) |

## Surface / Boundary / Repair / Validation

Ops façades + `appendSurfacePath` + quality levels 0/1/2.

## Remaining Bottlenecks

1. Clinical spatial **cold** build (~9–10 s) — first path only
2. Warm VTK+CGF1 still ~0.5–0.9 s round-trip inside ~2.6 s total

## Architecture

React → Clinical Application → Operation Runtime → Geometry Services →
Kernel Bridge → Native Worker. No VTK in React.
