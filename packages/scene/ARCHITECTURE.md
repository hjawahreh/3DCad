# Scene Projection Architecture

```text
DocumentRevisionView (read-only)
        ↓
SceneProjectionEngine
        ↓
ProjectionPipeline
  RevisionDiff → EntityMapper → Bounds → Visibility → SelectionProxy → PickingId
        ↓
immutable SceneSnapshot / SceneRevision
        ↓
Renderer consumption (outside this package)
```

## Principles

- Domain is authoritative; Scene is disposable.
- Scene never mutates Domain, never owns GPU/Three.js/renderer state.
- One Scene revision ↔ one Document revision.
- Incremental projection by default; full rebuild on `replaced` or invalidate.
- `SpatialIndex` is **contract-only** (reserved); no BVH in COD-007.

## Threading

Single-owner engine. Projection does not mutate shared global state. Do not share a live `ProjectionCache` across threads. Snapshots are immutable and safe to read concurrently after publication.

## Ownership

Caller owns `DocumentRevisionView`. Engine owns caches/mappers until `dispose()`. Snapshot ownership transfers to caller as an immutable value.
