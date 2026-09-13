# GEO-001B IMPLEMENTATION REPORT

## Real STL Before

| Arch | Triangles | Vertices | Components | Boundary edges | Fingerprint |
|---|---:|---:|---:|---:|---|
| Upper | 261 287 | 783 861 | 261 287 | 783 861 | `geo:052a19f9` |
| Lower | 233 562 | 700 686 | 233 562 | 700 686 | `geo:4f0579c1` |

Raw primary boundary was a single triangle (~1.8 mm) — GEO-001A failure mode.

## Normalized Mesh After

| Arch | Vertices | Components | Boundary edges | Exact dups removed | Duration |
|---|---:|---:|---:|---:|---:|
| Upper | 131 779 | **1** | **2 273** | 652 082 | ~10 s |
| Lower | (evidence JSON) | **≪ triangleCount** | realistic loop | — | — |

SOURCE remains raw. WORKING is normalized. Fingerprints deterministic.

Evidence: `docs/certification/geo-001b-evidence/normalization.json`

## Vertex Reduction

Upper: 783 861 → 131 779. Satisfies `normalizedVertexCount ≪ 3 × triangleCount`.

## Connectivity

Components: **261 287 → 1** on upper. Index adjacency now reflects the physical surface.

## Boundary Detection

Upper primary boundary after weld:

- point count: **2 273** (was 3)
- perimeter: **~350.7 mm** (was ~1.8 mm)
- projected area: **~1369 mm²**

Browser import confirms `boundaryPts=2273`. Close Base construction **not** patched.

## Surface Path

GEO-001A `"Trim boundary crosses disconnected scan surfaces."`:

- reproduced on **raw** soup (unit)
- **cleared** on normalized WORKING (`meshComponents=1`, path sample `components=1`, `disconnectedFailure=false`)

Connectivity validation was **not** weakened.

## Trim Retest

Hard topology gates (browser):

- Import normalize: **PASS** (`srcV=783861 workV=131779 comps=1`)
- Boundary diagnostic: **PASS**
- Disconnected SurfacePath failure: **CLEARED**

Remaining OBSERVE: some drawn loops still hit spacing / self-cross projection
errors — a distinct next failure from GEO-001A soup topology. Full Trim visual
certification can proceed once loop drawing is reliable on welded meshes.

## Close Base Boundary Retest

Diagnostic **PASS** (realistic border). Construction certification deferred.

## Tests

| Suite | Result |
|---|---|
| `geo-001b-topology-normalization.test.ts` | 12/12 PASS |
| `geo-001-clinical-geometry-engine.test.ts` | 12/12 PASS |
| `geo-001a-real-dental-baseline.test.ts` | 2/2 PASS |
| `trim.test.ts` + `close-base.test.ts` | 42/42 PASS |
| Combined batch | **68/68 PASS** |
| studio `typecheck` | PASS |

## Performance

Real upper (~261k tri): exact weld ≈ **10 s** (Node). Practical for 200k+.

## Browser Evidence

- Walkthrough: `docs/certification/geo-001b-browser-walkthrough.mjs`
- JSON: `docs/certification/geo-001b-browser-walkthrough.json`
- Shots: `docs/certification/geo-001b-browser-shots/`

## Remaining Failures

1. Close Base construction / ear-clip still open (by design for this milestone).
2. Browser Trim preview/accept incomplete when drawn loop fails spacing/self-cross
   — not the one-component-per-triangle defect.
3. Movement not started. Segmentation untouched.

## Certification

**PASS WITH OBSERVATIONS**

| Gate | Status |
|---|---|
| Exact weld topology foundation | **PASS** |
| Real STL component collapse | **PASS** |
| Realistic boundary extraction | **PASS** |
| GEO-001A disconnected SurfacePath | **CLEARED** |
| Close Base construction | **NOT CERTIFIED** |
| Clinical certification | **NOT CLAIMED** |
| Movement | **NOT STARTED** |

Architecture: `docs/architecture/GEO-001B-import-topology-normalization.md`
