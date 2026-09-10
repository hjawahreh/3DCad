# Frame Pipeline

Each frame follows a fixed sequence:

1. **Begin** — backend `beginFrame` with the configured clear color.
2. **Update** — optional caller callback receives frame id, delta, and size.
3. **Pass** — `RenderPipeline.execute` runs the compiled graph (or ordered bound passes).
4. **Submit** — begin/end a command buffer and `submit` to the backend.
5. **End** — backend `endFrame`, then `GpuResourceManager.releaseTransient()`.

`FrameExecutor` rejects nested or overlapping frames with `conflict`. Profiling is gated by `enableProfiling` and recorded through `FrameProfiler` / `FrameStatsCollector`.

`Renderer.renderFrame` requires an initialized, non-disposed session and forwards the optional update callback to the executor.
