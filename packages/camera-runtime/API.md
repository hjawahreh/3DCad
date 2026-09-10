# API

**Stability: Experimental** (pre-PC-001).

## CameraRuntime

| Method | Description |
| ------ | ----------- |
| `createSession(options?)` | Create registered session |
| `bootstrapSession(options?)` | Initialize → configure → attach |
| `getSession` / `getSessionForViewport` | Lookup |
| `dispose()` | Dispose all sessions |

## CameraSession

| Method | Description |
| ------ | ----------- |
| `initialize` / `configure` / `attachViewport` | Lifecycle |
| `synchronize(size)` | Viewport resize sync |
| `orbit` / `pan` / `zoom` | Navigation |
| `fitAll` / `fitSelection` | Framing (bounds in; no selection) |
| `resetView` / `presetView` | View presets |
| `setProjection` | Perspective ↔ orthographic |
| `animateTo` / `tickAnimation` / `cancelAnimation` | Interpolation |
| `pause` / `resume` / `detachViewport` / `shutdown` / `dispose` | Lifecycle |
| `getSnapshot` | Immutable camera snapshot |

## Failure modes

`cancelled` · `conflict` · `invalid` · `not-found` · `unavailable` · `validation` · `lifecycle` · `constraint` · `projection` · `sync` · `unexpected`

## Threading

Call session APIs on the owning thread only.
