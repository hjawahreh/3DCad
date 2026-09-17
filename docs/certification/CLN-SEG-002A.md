# CLN-SEG-002A — Remaining Production Segmentation Gates

**Date:** 2026-09-17  
**Status:** **PASS WITH OBSERVATIONS**

## Implementation

CLN-SEG-002 established the isolated production path:
`ProductionModelProvider → SegmentationWorkerClient → segmentation worker`.
This follow-up closes the binding boundary without creating another provider or inference route. The worker response is now fail-closed unless it echoes the request's geometry fingerprint, geometry revision, and arch, and supplies an inference run ID and timestamp. The response is validated before it is mapped to a prediction.

## Lifecycle

Production lifecycle remains `NOT_CONFIGURED → INITIALIZING → READY → INFERENCING → COMPLETED → ACCEPTED`, with `FAILED`, `REJECTED`, and `STALE` terminal/retry paths. The 180-second inference watchdog prevents an indefinite preparing state. The review UI derives its label from this lifecycle and separately labels reference output.

## Geometry Integrity

Acceptance rechecks the live Clinical Document object before any commit. A fingerprint, geometry revision, or arch mismatch makes the result `STALE` and rejects acceptance. Existing authoritative geometry commits mark accepted segmentation stale:

- Trim: `Segmentation Outdated — Geometry Changed (Trim)`
- Close Base: `Segmentation Outdated — Geometry Changed (Close Base)`

No parallel revision counter was added.

## Result Validation

The worker boundary rejects malformed payloads, mismatched fingerprint/revision/arch, missing run identity, missing timestamps, invalid numeric payloads, and incomplete required structures. Existing prediction validation rejects empty instances, invalid membership/index/labels, duplicate IDs/FDI assignments, non-finite geometry, and out-of-range face references before acceptance. Worker transport, HTTP, and inference errors become `FAILED` (or `NOT_CONFIGURED` for an unconfigured model), never `COMPLETED`.

## Configuration

Existing variables are unchanged: `CAD_SEG_CHECKPOINT`, `CAD_TSEGFORMER_ROOT`, `CAD_SEG_MODEL_VERSION`, and `CAD_SEG_WORKER_URL`. Health communicates `NOT_CONFIGURED`, usable/ready, or failed/unreachable with structured, non-secret fields. Checkpoint filesystem paths are no longer returned in model metadata or persisted in the Clinical Document.

## Persistence

Accepted metadata remains compact: provider/model/version, checkpoint fingerprint, geometry fingerprint/revision, arch, inference run ID/timestamp, validation status, face membership, and small runtime/stage summaries. It does not persist tensors, mesh buffers, or checkpoint paths. The existing save/reopen integrity test preserves a stale state after a geometry mutation.

## Heuristic Status and Biomechanics

The reference heuristic remains explicitly development/reference-only. It cannot become a production lifecycle completion, cannot overwrite production provenance, and cannot unlock biomechanics/NEXT. No biomechanics functionality was added.

## Evidence

| Gate                                         | Result                                                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio typecheck                             | PASS                                                                                                                                                                                               |
| Monorepo `pnpm test`                         | FAIL — 7 unrelated Trim integration tests failed while the VTK worker was unavailable                                                                                                              |
| Focused lifecycle + geometry-integrity tests | PASS — 26/26                                                                                                                                                                                       |
| Worker identity mismatch regression cases    | PASS — revision, arch, run ID, timestamp                                                                                                                                                           |
| Browser walkthrough command                  | FAIL — local Studio correctly reported unavailable worker; Import, Orientation, and Prepare passed, but the existing fixture script could not advance to Segmentation after its Trim/Base shortcut |
| Production inference timing                  | NOT AVAILABLE — no configured checkpoint or reachable worker                                                                                                                                       |

Browser evidence count: **3 PASS / 1 FAIL / 2 OBSERVE**. Screenshot directory: `docs/certification/cln-seg-001-browser-shots/` (`01-final-prepared-model.png`). The attempted command was `node docs/certification/cln-seg-001-browser-walkthrough.mjs` against local Studio on port 1420; its structured output is `docs/certification/cln-seg-001-browser-walkthrough.json`.

## Performance

No production checkpoint was configured and the worker was unreachable, so model initialization, inference, result-validation, and total Auto Segmentation timings were not measured. Fabricating timing or output would violate this gate.

## Clinical Status

Production clinical validation is **NOT established**. This is an engineering integrity gate, not evidence of regulatory approval, clinical accuracy, or clinical superiority.

## Remaining Observations

1. A configured, product-cleared checkpoint and reachable worker are required to complete production inference and capture its browser/timing evidence.
2. The browser walkthrough requires follow-up because its legacy fixture shortcut did not transition the workflow from Trim/Base to Segmentation; it produced only the prepared-model screenshot.
