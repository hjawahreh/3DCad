# Public API Reference

## Renderer

| Symbol | Role |
| --- | --- |
| `createRenderer(options?)` | Async factory returning `RenderResult<Renderer>` |
| `RendererFactory` | Creates renderers and optionally shares a `RendererRegistry` |
| `Renderer` | Session owner: backend, resources, materials, shaders, passes, pipeline, host, scheduler, services |
| `createDefaultGraph()` | Compiles depth → geometry → transparency → overlay with an external swapchain |
| `RendererCreateOptions` | Config plus optional `canvas`, `capabilities`, `forceBackend`, `registry` |

Primary methods: `initialize`, `resize`, `renderFrame`, `getGraph` / `setGraph`, `sessionInfo`, `dispose`.

## Render graph

| Symbol | Role |
| --- | --- |
| `RenderGraphBuilder` | Declares resources and passes, then `compile()` |
| `CompiledRenderGraph` | Immutable schedule, lifetimes, `debugView()`, `execute()` |
| `optimizeSchedule` | Deterministic secondary ordering helper |

Validation rejects unknown resources, unproduced non-external resources, and cycles.

## Resources

| Symbol | Role |
| --- | --- |
| `GpuResourceManager` | Ref-counted mesh buffers, textures, cubemaps, targets, framebuffers, pipelines |
| `ManagedResource` | Id, kind, handle, lifetime, byte size, key, ref count |
| `releaseTransient()` | Destroys unreferenced transient resources (called at frame end) |

## Materials

| Symbol | Role |
| --- | --- |
| `MaterialRegistry` | `create`, `createInstance`, `resolve`, `update`, `list`, `remove`, `defaultParams`, `clear` |
| `MaterialDescriptor` | Kind, params, version, optional parent |

## Shaders

| Symbol | Role |
| --- | --- |
| `ShaderRegistry` | `register`, `resolve`, `reflect`, `createVariant`, `hotReload`, `dependencies`, `list` |
| `ShaderDescriptor` | Source, hash, version, keywords, reflection, dependencies |

Empty sources are rejected. Identical source+keywords hashes reuse cached descriptors.

## Frame

| Symbol | Role |
| --- | --- |
| `FrameExecutor` | begin → update → pass → submit → end; rejects overlapping frames |
| `FrameProfiler` / `FrameStatsCollector` | Optional phase timings |

## Services

| Symbol | Role |
| --- | --- |
| `RendererRegistry` | Tracks live renderer sessions; rejects duplicate ids |
| `DebugRenderingService` | Wireframe/bounds/overdraw/culling debug flags |
| `ScreenshotService` | `capture` via backend `readPixels` |
| `ResourceInspector` | Lists managed resources and budgets |
| `PerformanceMetricsService` | Combines frame, GPU, and memory snapshots |
| `GpuTaskScheduler` | Priority queue with cancel and dispose abort |
| `CanvasHost` | Attach/detach/size without GPU ownership |
| `PassRegistry` / `RenderPipeline` | Pass factories and ordered execution |
| `detectGpuCapabilities` | Backend probe including `forceMock` |

Branded helpers: `asPassId`, `asShaderId`, `asMaterialId`, `asResourceId`, `asRendererId`, `renderSuccess`, `renderFailure`.

**Stability: Experimental** (pre-PC-001). Breaking public API changes require an ADR.
