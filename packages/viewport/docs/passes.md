# Passes

The pass framework provides reserved kinds and a lifecycle without product rendering logic.

## Lifecycle

`RenderPass` exposes `setup`, `execute`, and `teardown`. `BasePass.execute` auto-invokes `setup` when needed so callers may execute without an explicit setup call. `dispose` marks the pass unavailable.

## Reserved kinds

`geometry`, `depth`, `picking`, `selection`, `overlay`, `transparency`, `shadow`, `outline`, `hud`, `diagnostics`, `post-process`, `custom`.

Kinds are structural slots only. They do not implement picking, selection, CAD tools, or scene logic.

## Registry and pipeline

`PassRegistry` creates passes via per-kind factories (defaults provided) and rejects duplicate factory registration. `RenderPipeline` binds passes with an explicit order, optionally hosts a compiled graph, and executes either the graph or the ordered pass list.
