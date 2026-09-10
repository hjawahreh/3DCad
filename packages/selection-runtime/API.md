# API

**Stability: Experimental** (pre-PC-001).

## SelectionRuntime

| Method | Description |
| ------ | ----------- |
| `createSession(options?)` | Create registered session |
| `bootstrapSession(options?)` | Create + begin (ready) |
| `getSession(id)` | Lookup |
| `dispose()` | Dispose all sessions |

## SelectionSession

| Method | Description |
| ------ | ----------- |
| `begin` | Lifecycle start |
| `modify` / `commit` / `select` | Selection changes |
| `clear` | Empty selection |
| `undo` / `redo` | Local history hooks |
| `copyToClipboard` / `duplicateFromClipboard` / `clearClipboard` | Reference clipboard |
| `getSnapshot` / `lastHistoryEntry` | Immutable outputs |
| `dispose` | Teardown |

## Modes

`replace` · `add` · `subtract` · `toggle` · `range-reserved` (rejected — contract only)

## Failure modes

`cancelled` · `conflict` · `invalid` · `not-found` · `unavailable` · `validation` · `lifecycle` · `policy` · `unexpected`

## Threading

Call session APIs on the owning thread only.
