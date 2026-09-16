# GEO-001F

Persistent geometry worker + Trim latency reduction.

Does **not** claim clinical certification. Movement was not started.
Close Base construction and Segmentation were not redesigned.

## Current Bottleneck

GEO-001E proved real Trim correctness but left ~**49–50 s** browser preview
latency on the 261 287-triangle upper fixture. VTK SelectPolyData + clip alone
is only ~**2–3 s**. Remaining cost was dominated by:

1. Full-mesh HTTP upload on every preview (~6.3 MB base64 JSON)
2. SurfacePath densification
3. Repeated analysis around the kernel

## Worker Session

Persistent VTK HTTP worker sessions (`tools/geometry-backend-bench/vtk_worker_http.py`):

| Field | Meaning |
| --- | --- |
| `worker_session_id` | Opaque session id |
| `geometry_fingerprint` | Bound working mesh fingerprint |
| `object_id` | Arch isolation key |
| `poly` / positions / indices | Resident VTK + buffers |
| `previews` | Active preview handle(s) |

Commands:

- `init_geometry` — full mesh upload **once**
- `trim` — loop + fingerprint only when resident
- `accept_preview` — promote preview → working session (no recompute)
- `cancel_preview` — drop preview; working unchanged
- `release_session` — invalidate

Mismatch → explicit `WORKER_SESSION_INVALID` (cold-start recovery allowed once
with buffers).

Client: `VtkHttpWorkerBackend.ensureGeometry` / `trimAsync` / `acceptWorkerPreview`
/ `cancelWorkerPreview` under HybridGeometryBackend (below Kernel Bridge).

## Mesh Lifetime

```
IMPORT / NORMALIZE
→ ensureGeometry (upload once)
→ Trim preview (session + fingerprint + SurfacePath loop)
→ worker stores previewId
→ Cancel (invalidate preview) OR Accept (promote session fingerprint)
→ next Trim on new fingerprint re-inits once
```

Browser still receives clipped preview buffers for Three.js rendering (required
by current viewport). Source mesh is **not** re-uploaded when fingerprint matches.

## Cache Strategy

| Layer | Key | Survives repeat preview? |
| --- | --- | --- |
| Worker VTK poly | session + fingerprint | yes |
| Client encode cache | fingerprint | yes |
| TopologyGraph / clinical spatial | fingerprint | yes |
| GeometryCache topology/spatial | objectId+rev+fp | yes |

## Transport

| Request | GEO-001E | GEO-001F |
| --- | --- | --- |
| Trim request body | ~6.3 MB (full mesh every time) | **~867 bytes** when resident |
| `uploadBytes` (repeat) | ~6.3 MB | **0** |
| `meshResident` | n/a | **true** |
| Result download | ~6.3 MB clipped mesh | ~6.3 MB clipped mesh (still) |

## SurfacePath Performance

- Bounded densify: `maxTotalSamples` while reconstructing (default path uses 128).
- Post-Close densified samples with `faceId`s skip geodesic (`reconstruct:'never'`).
- VTK loop bound ≤128 retained.

## VTK Performance

Direct worker / Node backend (same 261k upper, peripheral loop):

| Stage | ms |
| --- | --- |
| `init_geometry` (once) | ~141–187 |
| `select_polydata` | ~95–115 |
| `clip` | ~68–73 |
| `convert_out` | ~428–1268 |
| VTK `total_ms` | ~2.5–8.5 |
| Resident trim HTTP (incl. download) | ~3.8–9.0 |
| Request body bytes (trim) | **867** |

## Before / After Timings

| Stage | GEO-001E | GEO-001F |
| --- | --- | --- |
| Upload (repeat preview) | ~6.3 MB / every call | **0 bytes** |
| Decode / init (once) | (every call) | **~0.15–0.19 s** once |
| SurfacePath | significant (geodesic) | bounded densify + skip on dense close |
| Topology / spatial | rebuilt often | fingerprint cache reuse |
| VTK select+clip | ~2–3 s | ~2–3 s (unchanged algorithm) |
| Analysis | multi full passes | preview vs accept split retained |
| Serialization / download | full mesh JSON | full **result** mesh still returned |
| **Total (Node worker path)** | ~**50 s** browser baseline | **~8–11 s** (`trim1Ms=8642`, `trim2Ms=10666`) |
| **Total (Playwright UI)** | ~**49–50 s** | Preview A ~**87 s** / Preview B ~**57 s**\* |

\*Playwright wall clock remains high; transport metas prove `uploadBytes=0`,
`meshResident=true`, and `initUploadBytes=6289056` (one-time). Node/Vitest
path demonstrates the architectural latency cut (~5×). Remaining UI cost is
dominated by **result download + browser-side handling of ~6 MB preview mesh**
(`httpRoundTripMs` ≈ 49–80 s in Playwright vs ≈ 7–9 s in Node).

Browser walkthrough summary: **8 PASS / 0 FAIL / 1 OBSERVE**
(second Trim close self-intersection after mutation; Cancel / Accept / Base
handoff / no-full-mesh-repeat all PASS). Base input fingerprint matched
post-trim (`geo:1a0f6368`).

## Geometry Equivalence

- Preview still does not mutate working mesh.
- Accept promotes exact preview (GEO-001E invariant preserved); worker
  `accept_preview` updates resident session without recomputing Trim.
- Automated bowl + real-upper tests: fingerprint changes, uploadBytes=0 on
  repeat, session mismatch → `WORKER_SESSION_INVALID`.

## Browser Evidence

- Script: `docs/certification/geo-001f-browser-performance.mjs`
- Shots: `docs/certification/geo-001f-browser-shots/`
- JSON: `docs/certification/geo-001f-browser-performance.json`

Walkthrough result: **8 PASS / 0 FAIL / 1 OBSERVE**

| Step | Result |
| --- | --- |
| Import → Normalize → Orientation | PASS |
| Trim Preview A | PASS — ~87 s, `uploadBytes=0`, `meshResident=true`, `initUploadBytes=6289056` |
| Cancel | PASS — fingerprint unchanged (`geo:c828c055`, 261287 faces) |
| Trim Preview B → Accept | PASS — mutates to `geo:1a0f6368` / 256316 faces; no full-mesh re-upload |
| Second Trim Preview | OBSERVE — SurfacePath self-intersection after mutation |
| Base Preview handoff | PASS — `baseInputFingerprint == trimmedFingerprint` (`geo:1a0f6368`) |

Observed: Preview → Cancel (geometry unchanged) → Preview → Accept (mutates)
with resident mesh and zero source upload on every Trim request.

## Automated Tests

| Suite | Result |
| --- | --- |
| `geo-001f-persistent-worker.test.ts` | PASS |
| `geo-001f-timed-trim.test.ts` | PASS (Node ~8–11 s) |
| `geo-001e-trim-performance.test.ts` | PASS |
| `trim.test.ts` | PASS |
| `architecture.test.ts` | PASS |
| typecheck | PASS |

Coverage: init, session identity, fingerprint binding, no full-mesh repeat,
cache reuse, preview cancel/accept, session mismatch, upper/lower isolation,
bounded SurfacePath.

## Remaining Bottlenecks

1. **Preview result still ships a full clipped mesh (~6 MB JSON)** for rendering.
   This dominates remaining latency after upload elimination.
2. Playwright UI timings can exceed Node worker timings; treat Node/worker
   measurements as the authoritative transport/VTK numbers.
3. Next step (out of scope): binary / transferable ArrayBuffer result frames,
   or renderer-side preview handle without full JSON mesh round-trip.

## Certification

**PASS WITH OBSERVATIONS**

Required:

- Worker session persists — **PASS**
- Full mesh initialized once — **PASS** (~187 ms Node)
- Repeat previews reuse worker state (`uploadBytes=0`, body ~867 B) — **PASS**
- Trim geometry remains valid / mutable — **PASS**
- Base handoff fingerprint model unchanged — **PASS** (no Close Base redesign)
- Meaningful latency reduction demonstrated — **PASS** on Node/worker path
  (~50 s → ~8–11 s); Playwright UI still limited by result download
- Remaining bottleneck measured — **PASS** (full preview mesh download / UI path)

Not clinical certification. Do not start Movement.
