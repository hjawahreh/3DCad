# Renderer

The `Renderer` is the session root for the viewport package. Construction wires a GPU backend, resource manager, material and shader registries, pass registry, render pipeline, canvas host, GPU task scheduler, frame executor, and diagnostic services.

Sessions are created through `createRenderer` or `RendererFactory`. Optional `forceBackend: 'mock'` selects the deterministic mock backend for tests and headless runs. An optional `RendererRegistry` records live sessions and rejects duplicate ids.

`initialize` attaches an optional canvas, initializes the backend, and marks the session ready. `renderFrame` runs one frame through the executor. `dispose` cancels GPU tasks, disposes registries and resources, detaches the host, and destroys the backend.

The default render graph is depth → geometry → transparency → overlay, writing an external swapchain resource. Callers may replace the graph with `setGraph` after compiling a custom `RenderGraphBuilder` result.
