# Public APIs

Consumers should import only from `@cad-studio/viewport` (`src/index.ts`).

## Session entry points

- `createRenderer` / `RendererFactory` / `Renderer`
- `RendererRegistry`
- `detectGpuCapabilities` / `selectBackend` / config types

## Graph and frame

- `RenderGraphBuilder` / `CompiledRenderGraph` / `createDefaultGraph`
- `RenderPipeline` / `PassRegistry` / `BasePass` / `ALL_PASS_KINDS`
- `FrameExecutor` / timing helpers (advanced)

## Assets and GPU

- `GpuResourceManager` types (normally via `renderer.resources`)
- `MaterialRegistry` / `ShaderRegistry`
- `CanvasHost`
- `GpuTaskScheduler`

## Services

- `DebugRenderingService`
- `ScreenshotService`
- `ResourceInspector`
- `PerformanceMetricsService`

## Results and ids

- `renderSuccess` / `renderFailure` / `RenderResult`
- `asPassId`, `asShaderId`, `asMaterialId`, `asResourceId`, `asRendererId`, and related brand helpers

Deep imports into `src/**` internal folders are unsupported and may change without notice.
