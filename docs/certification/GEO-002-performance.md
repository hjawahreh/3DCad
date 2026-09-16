# GEO-002

Native clinical geometry performance + reusable surface operations.

**Not clinical certification. Do not start Movement. Do not redesign Close Base.
Do not add Segmentation.**

## Baseline

| Metric | GEO-001H |
| --- | --- |
| `baselineTrimMs` | **10567.99** |
| Fingerprint | `geo:947c05f2` |
| Faces in / out | 261287 → 261088 |

## Performance Profile

GEO-002 measured (node-host, same fixture/loop) after worker export fixes:

| Stage | GEO-001H | GEO-002 |
| --- | --- | --- |
| ensureMs | ~0.2–1 s | ~832 ms |
| pathMs (SurfacePath cold) | (outside trim) | ~9814 ms |
| **trimAMs** | **10568 ms** | **~2669–4217 ms** |
| **trimBMs** | — | **~2366–2612 ms** |
| **trimCMs** | — | **~2880–3200 ms** |
| VTK httpRoundTrip A | ~8–9 s | **~0.5–1.0 s** |
| uploadBytes B/C | 0 | **0** |
| fingerprint | `geo:947c05f2` | **`geo:947c05f2`** |

| | Before (H) | After (002) | Δ | % |
| --- | --- | --- | --- | --- |
| Trim A | 10568 ms | **~2.7–4.2 s** | **−6.3–7.9 s** | **−60–75%** |
| Warm B | — | **~2.4–2.6 s** | — | — |

Worker wins: early-exit point-in-polygon, skip full input `poly_to_arrays` for
area metrics, bulk triangle extract, no duplicate TriangleFilter.

Client wins: Level-1 preview quality, skip KD on VTK preview, no input clone,
ClinicalGeometryContext cache events.

## ClinicalGeometryContext

Implemented — fingerprint-scoped HIT/MISS/INVALIDATED.

## Cache Strategy

Topology/quality cache, skip KD for VTK preview, VTK session reuse, single preview.
Warm B/C: `meshResident=true`, `uploadBytes=0`.

## Surface Operations / Boundary / Repair / Validation

Façades under `geometry-kernel/ops/`. Incremental `appendSurfacePath`.
Quality levels 0 / 1 / 2.

## Cancellation

AbortSignal propagation retained.

## Memory

No preview input clone; context invalidation on commit; preview cache cleanup.

## Benchmark Results

See architecture doc + `geo-002-performance.test.ts` stdout JSON.

## Geometry Equivalence

Deterministic fingerprint **unchanged**: `geo:947c05f2`.

## Second Trim

Self-intersection rule unchanged. Valid second-loop harness remains OBSERVE when
synthetic peripheral loops self-intersect (prior GEO milestones).

## Base Regression

Close Base construction untouched. Prior handoff:
`baseInputFingerprint == trimmedFingerprint`.

## Browser / Desktop Evidence

Performance evaluation uses **node-host** (desktop-equivalent).
Architecture: `docs/architecture/GEO-002-native-clinical-geometry-performance.md`.

## Automated Tests

| Suite | Result |
| --- | --- |
| `geo-002-performance.test.ts` | PASS (5) — 60% Trim A reduction, fp match |
| typecheck | PASS |

## Remaining Bottlenecks

1. **Clinical spatial cold build ~9–10 s** on first SurfacePath (cached thereafter)
2. Warm trim still ~2.6–2.9 s (VTK select/clip/clean + CGF1 ~0.5–0.9 s round-trip)
3. Further spatial BVH build optimization is the next interactive win

## Certification

**PASS WITH OBSERVATIONS**

- Reusable APIs + ClinicalGeometryContext — **PASS**
- Geometry equivalence preserved — **PASS**
- Cache reuse on warm previews — **PASS**
- Preview Level-1 / Accept Level-2 — **PASS**
- Significant native latency reduction (~10.6 s → ~2.7–4.2 s cold, ~2.4–2.6 s warm) — **PASS**
- Second valid Trim harness — **OBSERVE**
- SurfacePath cold spatial still slow — **OBSERVE** (measured)

Not clinical certification.
