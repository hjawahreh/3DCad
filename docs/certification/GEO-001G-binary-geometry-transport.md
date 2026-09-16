# GEO-001G

Binary geometry result transport for Trim preview — eliminate JSON/base64 mesh
payloads and reduce browser reconstruction cost without changing clinical
geometry.

**Not clinical certification. Do not start Movement. Close Base / Segmentation unchanged.**

## Current Bottleneck

GEO-001F eliminated repeated **source mesh upload**. Remaining cost was the
**~6 MB result download** encoded as base64 inside JSON (`positions_b64` /
`indices_b64`), plus browser `JSON.parse` / base64 decode / typed-array rebuild.

| Metric | GEO-001F (proven) |
| --- | --- |
| Upload on repeat Trim | 0 B (resident) |
| Download | ~6.3 MB base64-in-JSON |
| Browser Preview A / B | ~87 s / ~57 s |
| Node Trim | ~5.8–6.4 s |

## Binary Frame

`CGF1` (`application/vnd.clinical.geometry-frame`):

- 64-byte header: magic `CGF1`, version, counts, component types, offsets
- Compact UTF-8 JSON **meta only** (timings, fingerprints, previewId, diagnostics)
- Raw `Float32` positions + `Uint32` indices (optional normals)
- 8-byte alignment for typed-array views

Codec: `apps/studio/src/geometry-kernel/transport/BinaryGeometryFrame.ts`

Failure codes: `BINARY_GEOMETRY_INVALID`, `BINARY_GEOMETRY_TRUNCATED`,
`BINARY_GEOMETRY_VERSION_UNSUPPORTED`.

## Transport

Worker (`tools/geometry-backend-bench/vtk_worker_http.py`, GEO-001G):

- `result_format: "binary"` → single binary HTTP body (no JSON mesh arrays)
- Session / accept / cancel remain small JSON

Client (`VtkHttpWorkerBackend`):

- `Accept: application/vnd.clinical.geometry-frame, application/json`
- `arrayBuffer()` → validate → TypedArray views → `TriangleMesh`
- Metas: `resultFormat`, `binaryBytes`, `jsonBytes`, `decodeMs`, `arrayBufferMs`

## Browser Reconstruction

Binary → owned `Float32Array`/`Uint32Array` → MeshRegistry → Three.js
`BufferAttribute` **without** intermediate `.slice()` copies in
`ClinicalMeshViewport.buildGeometry`.

## GPU Upload

Same Three.js path; fewer CPU copies before attribute bind. Normals via
`computeVertexNormals()` once per bind.

## Cache Behavior

- GEO-001F worker session unchanged (resident mesh + fingerprint)
- Client `previewCache` by `previewId`
- Cancel clears preview cache; Accept promotes without re-download
- Viewport reuses mesh when fingerprint matches

## Memory

Avoids retaining base64 strings, JSON number arrays, and `atob` intermediates.
Steady state: working geometry + at most one preview.

## GEO-001F vs GEO-001G

| Stage | GEO-001F | GEO-001G |
| --- | --- | --- |
| Upload (repeat) | 0 B | 0 B |
| Result format | JSON + base64 | **CGF1 binary** |
| Download (browser Preview A) | ~6.17 MB | **~4.63 MB** (`jsonBytes=0`) |
| Decode | base64 + JSON | **`decodeMs≈0.3 ms`**, `arrayBufferMs≈360 ms` |
| Node Trim 1 / 2 | ~6.4 s / ~5.8 s | **~5.0 s / ~5.2 s** |
| **Browser Preview A** | **~86.6 s** | **~36.6 s** |
| **Browser Preview B** | **~57.4 s** | **~38.9 s** |
| Base Preview | ~10.4 s | ~9.6 s |

## Real Dental Results

261287-face upper:

- Node binary trim: `downloadBytes≈4.72 MB`, `resultFormat=binary`, fingerprint
  `geo:947c05f2` (same path as F)
- Browser Accept: `geo:c828c055` → `geo:1a0f6368` / 256316 faces (same as F)
- Base handoff: `baseInputFingerprint == trimmedFingerprint` (`geo:1a0f6368`)

## Browser Evidence

- Script: `docs/certification/geo-001g-browser-performance.mjs`
- JSON: `docs/certification/geo-001g-browser-performance.json`
- Shots: `docs/certification/geo-001g-browser-shots/`
  (`01-before`, `02-loop`, `03-preview`, `04-accepted`, `05-base`, `06-reopened`)

Walkthrough: **9 PASS / 0 FAIL / 2 OBSERVE**

| Step | Result |
| --- | --- |
| Preview A | PASS — 36611 ms, binary, upload=0, download≈4.63 MB |
| Cancel | PASS — fingerprint unchanged |
| Preview B → Accept | PASS — mutates; binary; upload=0 |
| Second Trim | OBSERVE — self-intersecting close (unchanged correctness) |
| Base handoff | PASS |
| No full-mesh repeat | PASS |
| Binary result path | PASS (`resultFormat=binary`, `jsonBytes=0`) |
| Save / reopen | OBSERVE — persistence save API not exposed in walkthrough harness |

## Automated Tests

| Suite | Result |
| --- | --- |
| `geo-001g-binary-transport.test.ts` | PASS |
| `geo-001f-timed-trim.test.ts` | PASS (binary on real upper) |
| `geo-001f-persistent-worker.test.ts` | PASS |
| `geo-001e-trim-performance.test.ts` | PASS |
| `trim.test.ts` | PASS |
| `architecture.test.ts` | PASS |
| typecheck | PASS |

## Remaining Bottlenecks

1. **Browser `httpRoundTripMs` still ~33–35 s** for ~4.6 MB in this Playwright /
   Chromium environment — much of Preview wall clock. Node fetches the same
   payload in ~4–5 s. Environment / IPC / Chromium transfer dominates vs decode.
2. **VTK convert_out + clip pipeline** (~3.8–4.5 s Node) unchanged by transport.
3. Optional next: compression, true transferable ownership into GPU buffers,
   preview-lite quality path (already partly split in F).

## Certification

**PASS WITH OBSERVATIONS**

- Binary result path works — **PASS**
- Geometry equivalence preserved (fingerprints / Accept / Base) — **PASS**
- Worker session behavior retained — **PASS**
- Browser reconstruction correct — **PASS**
- Latency materially reduced — **PASS**
  (Preview A ~87 s → ~37 s; download ~6.2 MB → ~4.6 MB; geometry JSON bytes → 0)
- Remaining transfer/environment bottleneck measured — **PASS** (observation)

Not clinical certification. Do not start Movement.
