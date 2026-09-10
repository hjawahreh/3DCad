# API

**Stability: Experimental** (pre-PC-001).

## ImportRuntime

| Method | Description |
| ------ | ----------- |
| `createRequest(input)` | Build immutable import request |
| `createSession(options?)` | Create concurrent session |
| `import(request, signal?)` | Convenience create+run |
| `getPlugins` / `getFactory` / `getDispatcher` | Plug-in surface |
| `dispose()` | Dispose sessions |

## ImportSession

| Method | Description |
| ------ | ----------- |
| `run(request, signal?)` | Full pipeline |
| `cancel(reason?)` | Abort in-flight import |
| `getSnapshot` / `getMetrics` / `getDiagnostics` | Observability |
| `dispose()` | Teardown |

## Failure modes

`cancelled` · `conflict` · `invalid` · `not-found` · `unavailable` · `validation` · `lifecycle` · `unsupported` · `pipeline` · `unexpected`

## Threading

Concurrent sessions OK. Session APIs are single-owner. Cancellation via `AbortSignal` / `cancel()`.
