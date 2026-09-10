# API

**Stability: Experimental** (pre-PC-001).

## ViewportRuntime

| Method | Description |
| ------ | ----------- |
| `createSession(options?)` | Create session (`Result`) |
| `bootstrapSession(session, canvas, signal?)` | Initialize → configure → attach |
| `getSession(id)` | Lookup |
| `dispose()` | Dispose all sessions |

## ViewportSession

| Method | Description |
| ------ | ----------- |
| `initialize` / `configure` / `attachCanvas` | Lifecycle |
| `run` / `pause` / `resume` | Presentation loop |
| `resize` / `invalidate` / `publishScene` | Frame drivers |
| `pumpFrame` | Deterministic single frame (tests/hosts) |
| `shutdown` / `dispose` | Ordered teardown |
| `getMetrics` / `getDiagnostics` / `getState` | Observability |

## Failure modes

`cancelled` · `conflict` · `invalid` · `not-found` · `unavailable` · `validation` · `lifecycle` · `backend` · `context-lost` · `unexpected`

## Threading

Call session APIs on the owning thread only. Published metrics/diagnostics snapshots are immutable.

## Cancellation

`AbortSignal` honored during `initialize` / `attachCanvas` / renderer creation / frame execution.
