# Viewport Runtime Architecture

```text
SceneSnapshot (@cad-studio/scene)
        ↓
SceneBridge
        ↓
ViewportSession / FrameCoordinator
        ↓
RendererBridge → Graphics Engine (@cad-studio/viewport)
        ↓
Canvas / Window (host-owned)
```

## Responsibilities

- Viewport lifecycle (create → dispose)
- Session ownership (one session per viewport)
- Frame scheduling (continuous / on-demand / idle)
- Canvas attach, HiDPI resize, visibility, context-loss awareness
- Deterministic backend selection (WebGPU → WebGL2 → Failure/mock)
- Diagnostics and metrics
- Resource lifecycle / shutdown ordering

## Non-responsibilities

- Camera / navigation / picking / selection logic
- Three.js scene graph construction
- Geometry, kernel, clinical workflows
- React rendering

## Thread model

Single-owner per `ViewportRuntime` / `ViewportSession`. No hidden globals. Injectable `FrameClock` for deterministic tests. Do not share mutable session state across threads.

## Ownership

Caller owns canvas DOM nodes and `SceneSnapshot` values. Runtime owns renderer bridge, schedulers, and caches until `dispose()`.
