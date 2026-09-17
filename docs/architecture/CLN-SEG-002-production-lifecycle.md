# CLN-SEG-002 — Production Segmentation Bring-Up & Review

## Purpose

Harden the existing CLN-SEG-001 production path into an **honest, deterministic, reviewable** engineering lifecycle without redesigning the platform or adding a parallel provider architecture.

## Non-negotiable boundaries

```
UI / ClinicalSegmentationController
  → ProductionModelProvider
    → SegmentationWorkerClient
      → tools/segmentation-inference (PyTorch isolated)
```

- React never runs PyTorch / NumPy inference.
- Production never silently falls back to `reference-heuristic`.
- Reference heuristic remains development-only and is labeled REFERENCE / BETA.

## Authoritative lifecycle

`ProductionSegmentationLifecycle` states:

```
NOT_CONFIGURED
INITIALIZING
READY
INFERENCING
COMPLETED
ACCEPTED
REJECTED
FAILED
STALE
```

Orthogonal to internal `SegmentationPhase` (`preparing` / `inferencing` / `ready-for-review` / …).

Review UI maps lifecycle →:

| Kind | Meaning |
|------|---------|
| no-model | NOT_CONFIGURED |
| model-loading | INITIALIZING |
| model-ready | READY |
| inference-running | INFERENCING |
| inference-failed | FAILED |
| inference-completed | COMPLETED |
| accepted | ACCEPTED |
| rejected | REJECTED |
| stale | STALE |

**Watchdog:** `PRODUCTION_INFERENCE_WATCHDOG_MS` (180s) forces `FAILED` so a permanent `preparing` snapshot is impossible.

## Validation

- `validateWorkerInferRequest` — fingerprint, revision, mesh buffers.
- `validateWorkerInferResult` — fingerprint bind, FDI/confidence arrays, toothInstances, modelMetadata, sampleToSource, preprocessing.
- Controller also refuses predictions whose `geometryFingerprint` / `sourceRevision` do not match the working mesh.

## Persistence (accept)

`segmentationMeta` now may include:

- `checkpointFingerprint`
- `inferenceMetadata` (device, runtimeMs, sampleCount, versions, stages)
- existing: provider/model/version, geometryFingerprint, sourceRevision, faceMembership, FDI teeth, status

Trim / Close Base still mark `status: STALE` via `markSegmentationStaleOnGeometryCommit`.

## Biomechanics

Heuristic / reference acceptance **does not** advance preparation to `ready-for-movement`.
`evaluateCaseMovementReadiness` already requires non-heuristic CURRENT + PASS + membership.

## Key files

- `runtime/ProductionSegmentationLifecycle.ts`
- `runtime/validateWorkerInferResult.ts`
- `ClinicalSegmentationSession.ts` (`productionLifecycle`)
- `ClinicalSegmentationController.ts`
- `ClinicalSegmentationManager.ts`
- Toolbar / Overlay lifecycle labels (`data-lifecycle`, `data-review-kind`)

## Tests

`apps/studio/test/clinical/segmentation/cln-seg-002-production-lifecycle.test.ts`
