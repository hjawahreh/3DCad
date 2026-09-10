# Viewport Architecture

```text
Application
    ↓
Viewport Host (CanvasHost)
    ↓
Renderer
    ↓
Render Graph
    ↓
Render Pipeline
    ↓
Render Passes
    ↓
GPU Backend
    ↓
Graphics API (WebGPU / WebGL2 / Mock)
```

## Ownership

The `Renderer` owns the session: backend, resource manager, material and shader registries, pass registry, pipeline, frame executor, canvas host, GPU task scheduler, and diagnostic services. Nothing outside the renderer may create or mutate GPU handles.

`CanvasHost` owns only canvas size and attach/detach. It does not create GPU objects. React and other UI layers may supply an `HTMLCanvasElement`; they must not hold Three.js objects, backend instances, or GPU resources.

## Backend selection

Capability detection (`detectGpuCapabilities`) reports preferred and available backends. `createGpuBackend` selects WebGPU when available, otherwise WebGL2, otherwise Mock, unless the caller forces a backend. Fallback respects `RendererConfig.allowFallback`.

## Invariants

- No hidden globals beyond a module-local renderer id serial.
- Deterministic render-graph scheduling for equal-priority independent passes.
- Transient GPU resources are released at frame end.
- Explicit dispose tears down scheduler tasks, passes, materials, shaders, resources, and the backend.
- Pass kinds are reserved slots without product or CAD logic.
