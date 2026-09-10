# Memory Strategy

Memory is split into transient and persistent budgets configured on the renderer.

Transient resources (typical render targets and frame-local scratch) are reference-counted, pooled by key when released, and destroyed by `releaseTransient` at frame end when unreferenced. Persistent resources (meshes, long-lived textures, pipelines) remain until the resource manager is disposed or the resource is destroyed through budgeted teardown.

Budget exhaustion returns `exhausted` rather than allocating past the configured ceiling. Inspect live usage through `GpuResourceManager.budgets()` or `ResourceInspector`.

Streaming and background uploads should stage into persistent resources via the GPU task scheduler so frame-local memory stays bounded.
