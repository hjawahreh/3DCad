# Render Graph

The render graph declares named resources and passes, then compiles a validated, deterministic schedule.

## Declaration

`RenderGraphBuilder.addResource` records texture, buffer, or external resources with optional lifetimes. `addPass` records reads, writes, and an optional execute callback.

## Validation

Compilation fails when a pass references an unknown resource, a non-external resource has no producer, or pass dependencies form a cycle. Passes with neither reads nor writes emit warnings.

## Scheduling

Producer → consumer edges are derived from resource writes and reads. External resources do not create producer edges. Kahn topological sort yields the schedule; independent ready passes are ordered lexicographically by id.

## Lifetimes

Each resource records producers, consumers, first use, and last use across the schedule. Transient resources are candidates for aliasing and early release; persistent and external resources outlive a single pass.

## Optimization

`optimizeSchedule` provides deterministic secondary ordering. Future aliasing and barrier coalescing plug in at this boundary without changing the public compile contract.

## Debug

`CompiledRenderGraph.debugView()` returns passes, schedule, resources, dependency edges, and warnings. `execute()` runs pass callbacks in schedule order and returns the executed pass ids.
