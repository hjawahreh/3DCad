# API

**Stability: Experimental** (pre-PC-001).

## ProjectRuntime

| Method | Description |
| ------ | ----------- |
| `createSession(options?)` | Create registered session |
| `getActiveSession` / `getSession` | Lookup |
| `getRecentProjects()` | Recent projects registry |
| `dispose()` | Dispose all sessions |

## ProjectSession

| Method | Description |
| ------ | ----------- |
| `create` / `open` | Create empty or open from metadata |
| `modify` / `markDirty` | Dirty tracking |
| `save` / `runAutosaveNow` | Save contracts |
| `suppressAutosave` / `resumeAutosave` | Autosave control |
| `close(force?)` / `dispose` | Teardown |
| `updateMetadata` / `updateSettings` / `setReadOnly` | Metadata/settings |
| `getSnapshot` | Immutable snapshot |

## Failure modes

`cancelled` · `conflict` · `invalid` · `not-found` · `unavailable` · `validation` · `lifecycle` · `dirty` · `autosave` · `readonly` · `unexpected`

## Threading

Call session APIs on the owning thread only.
