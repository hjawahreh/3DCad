# Testing

Unit tests cover container lifetimes and overrides, lifecycle order, command pipeline ordering, event priority/replay, query cache behavior, immutable state, scheduler dependency/cancellation behavior, ECS queries, diagnostics, and plugin compatibility.

Integration tests compose a runtime with deterministic fake clock/executor adapters. Architecture tests prohibit imports from UI, rendering, geometry, native, and product directories. Tests use no wall-clock waiting or ambient globals.
