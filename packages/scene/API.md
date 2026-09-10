# API

**Stability: Experimental** (pre-PC-001).

## SceneProjectionEngine

| Method | Description |
| ------ | ----------- |
| `project(doc, signal?)` | Project document revision → `SceneRevision` (`Result`) |
| `currentSnapshot()` | Latest immutable snapshot |
| `invalidate()` | Clear cache/world for full rebuild |
| `metrics()` / `diagnostics()` | Observability |
| `dispose()` | Release world, caches, registries |

## Supporting types

`DocumentRevisionView`, `DocumentEntityView`, `SceneSnapshot`, `SceneRevision`, `RevisionDiffEngine`, `EntityMapper`, `ProjectionCache`, `PickingIdRegistry`, builders, `ReservedSpatialIndex`.

## Failure modes

`invalid` · `revision-mismatch` · `cancelled` · `conflict` · `unavailable` · `not-found` · `validation` · `unexpected`

## Threading

Engine is not internally synchronized for concurrent `project()`; call serially per world. Published snapshots are immutable.
