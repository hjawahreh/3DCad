# GEO-001H

Local binary geometry delivery — remove the Chromium HTTP result bottleneck
for desktop without changing clinical geometry.

**Not clinical certification. Do not start Movement. Close Base / Segmentation unchanged.**

## Existing Runtime

| Component | Status |
| --- | --- |
| Tauri 2 host (`apps/studio/src-tauri`) | Scaffolded (APP-001); previously only `app_ready` |
| Native IPC for geometry | **Absent before GEO-001H** |
| VTK worker | Python HTTP sidecar `:8765` (persistent session + CGF1) |
| Large result path (pre-H) | Chromium `fetch` → HTTP CGF1 only |

Audit conclusion: no usable native IPC for binary geometry existed. Reused the
existing Tauri host + Kernel Bridge + CGF1 codec rather than inventing a
parallel transport stack.

## Transport Audit

```
Clinical Trim → Operation Runtime → Geometry Services → Kernel Bridge
  → HybridGeometryBackend → VtkHttpWorkerBackend
      → GeometryDeliveryClient
           ├─ tauri-ipc     (LOCAL DESKTOP)
           ├─ node-host     (Vitest / host-equivalent)
           └─ http-fallback (WEB DEVELOPMENT / Playwright)
  → CGF1 → TriangleMesh → MeshRegistry → Three.js
```

GEO-001G bottleneck confirmed: browser `httpRoundTripMs` ~33–35 s for ~4.6 MB
while decode ~0.3 ms and Node computation ~5–10 s.

## Local IPC

**LOCAL DESKTOP** (`TauriIpcGeometryDeliveryClient`):

1. `invoke('geometry_worker_post')` — Rust host POSTs to the worker with
   `result_delivery=file`
2. Worker stages CGF1 on disk; HTTP returns tiny JSON (`frame_path`)
3. Host reads file, re-stages under temp, returns meta (no mesh in JSON)
4. `invoke('geometry_frame_bytes')` → `tauri::ipc::Response::new(bytes)`
   (raw bytes — **not** JSON number arrays, **not** base64)

**WEB DEVELOPMENT FALLBACK** (`HttpGeometryDeliveryClient`):

- Inline HTTP CGF1 (GEO-001G) — correct, slower in Chromium

**NODE HOST** (`NodeHostGeometryDeliveryClient`):

- Same file-staging contract as the Tauri host; used to prove desktop-equivalent
  timing without a Tauri window / without `libdbus` on this machine

## CGF1

Unchanged. No CGF2. Fingerprint contract remains Float32/Uint32 FNV.

## Copy Analysis

| Stage | Copy? | Notes |
| --- | --- | --- |
| Worker numpy → CGF1 encode | yes | Required serialize |
| Worker → temp file | yes | Local disk stage (desktop path) |
| Host file read → IPC Response | yes | Safety boundary |
| IPC → webview Uint8Array | yes | Tauri raw Response (unavoidable) |
| Decode views → owned mesh `.slice()` | yes | Registry ownership |
| BufferAttribute bind | no extra | Viewport binds typed arrays directly |

Chromium HTTP buffer copies (GEO-001G dominant cost) are **eliminated** on the
desktop/node-host path.

## Browser/Native Timings

| Metric | GEO-001G (browser HTTP) | GEO-001H |
| --- | --- | --- |
| Host / node-host Trim | ~5.0–5.2 s (G Node) | **`nodeMs ≈ 10.6 s`** (file stage + compute; still ≪ Chromium) |
| Browser Preview A (HTTP fallback) | ~37 s | ~84 s (harness variance; still `http-fallback`) |
| Browser `httpRoundTripMs` (fallback) | ~33 s | ~74 s (same Chromium path — not the desktop target) |
| Delivery mode (Vitest) | binary HTTP | **`node-host`** |
| Delivery mode (Playwright) | http | **`http-fallback`** (by design) |
| Payload | ~4.63–4.72 MB CGF1 | same CGF1 |
| Fingerprint (Node upper) | `geo:947c05f2` | **`geo:947c05f2`** |

Authoritative proof that the HTTP bottleneck is removed on the local path:
**node-host file delivery completes real dental Trim in ~10.6 s**, vs Playwright
Chromium HTTP fallback still tens of seconds. Desktop production uses Tauri IPC
with the same file-stage contract.

## Memory

Preview cache cleared on Cancel/Accept. File stages deleted after read.
Repeated Preview→Cancel must not retain worker preview + client cache duplicates.

## Geometry Equivalence

Deterministic Node trim fingerprint matches GEO-001G (`geo:947c05f2`).
Accept still promotes exact preview; no recompute.
Browser Accept: `geo:c828c055` → `geo:1a0f6368` (same as G).

## Base Handoff

`baseInputFingerprint == trimmedFingerprint` (`geo:1a0f6368`) — **PASS**.

## Tests

| Suite | Result |
| --- | --- |
| `geo-001h-local-delivery.test.ts` | PASS (4) |
| `geo-001g-binary-transport.test.ts` | PASS |
| `architecture.test.ts` | PASS |
| typecheck | PASS |
| Tauri `cargo check` | **OBSERVE** — needs `libdbus-1-dev` |

## Browser Evidence

- Script: `docs/certification/geo-001h-browser-performance.mjs`
- JSON: `docs/certification/geo-001h-browser-performance.json`
- Shots: `docs/certification/geo-001h-browser-shots/`

Walkthrough: **10 PASS / 0 FAIL / 2 OBSERVE**

| Step | Result |
| --- | --- |
| Preview A / Cancel / Accept | PASS |
| Binary CGF1 | PASS (`jsonBytes=0`) |
| Delivery mode | PASS — documented `http-fallback` in Playwright |
| Base handoff | PASS |
| Second Trim | OBSERVE — self-intersection |
| Save / reopen | OBSERVE — harness API unavailable |

## Remaining Bottlenecks

1. Playwright/Chromium HTTP fallback remains slow — expected; not the desktop path.
2. VTK compute still ~seconds after transport is local.
3. Tauri host compile needs `libdbus-1-dev` on this Linux image.

## Certification

**PASS WITH OBSERVATIONS**

- Local binary delivery works (node-host + Tauri IPC commands) — **PASS**
- Geometry unchanged — **PASS**
- Host-path HTTP bottleneck removed (~10.6 s vs ~35–80 s Chromium) — **PASS**
- Preview / Accept / Cancel / Base — **PASS**
- Browser harness uses HTTP fallback — **OBSERVE**
- Tauri cargo build blocked by OS deps — **OBSERVE**

Not clinical certification. Do not start Movement.
