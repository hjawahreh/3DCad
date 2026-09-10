# API

**Stability: Experimental** (pre-PC-001).

## InteractionRuntime

| Method | Description |
| ------ | ----------- |
| `createSession(options?)` | Create registered session |
| `bootstrapSession(options?)` | Create + initialize + activate |
| `getSession` / `getSessionForViewport` | Lookup |
| `dispose()` | Dispose all sessions |

## InteractionSession

| Method | Description |
| ------ | ----------- |
| `initialize` / `activate` / `pause` / `resume` | Lifecycle |
| `handle(raw)` | Full input pipeline → immutable events |
| `capturePointer` / `releasePointer` | Capture ownership |
| `setFocus` / `blurFocus` | Focus ownership |
| `setCursor` / `invalidateHover` | Cursor / hover |
| `subscribe(listener)` | Consume immutable events |
| `shutdown` / `dispose` | Teardown |

## Failure modes

`cancelled` · `conflict` · `invalid` · `not-found` · `unavailable` · `validation` · `lifecycle` · `capture` · `unexpected`

## Threading

Call session APIs on the owning thread only. Do not share mutable session state across threads.

## Cancellation

`AbortSignal` on initialize / handle rejects further input when aborted.
