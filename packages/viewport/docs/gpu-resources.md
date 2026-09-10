# GPU Resources

`GpuResourceManager` tracks GPU allocations behind branded resource ids.

## Creation

Factories cover mesh buffers (vertex ± index), textures, cubemaps, render targets, framebuffers, and pipelines. Each allocation records kind, handle, lifetime, byte size, and cache key.

## Lifetimes

- **transient** — eligible for pooling on release and destroyed by `releaseTransient` when unreferenced (frame end).
- **persistent** — retained until explicit dispose of the manager or resource teardown.
- **external** — graph-level marker for resources owned outside the manager (for example swapchain).

## Reference counting

`acquire` / `release` adjust `refCount`. Transient resources with zero refs enter a key-based pool for reuse.

## Budgets

Transient and persistent byte budgets come from `ResolvedRendererConfig`. Exceeding a budget returns `exhausted`.

## Dispose

`dispose` destroys every tracked handle through the backend and clears pools and key maps. Callers must not use handles after dispose.
