# Platform Runtime

## Purpose

`@cad-studio/platform-runtime` is the generic, framework-free application runtime. It owns dependency composition, lifecycle coordination, typed buses, immutable state, task scheduling, generic ECS, diagnostics, and plugin extension contracts. It contains no CAD, clinical, geometry, rendering, file-format, UI, or native-platform behavior.

## Owner

CAD Studio Platform team.

## Public API

Only `src/index.ts` is public. Consumers create a runtime through `RuntimeBuilder`; no consumer constructs infrastructure dependencies directly.

## Allowed dependencies

TypeScript standard library and contract-only packages. Runtime adapters belong in composition roots, not this package.

## Prohibited dependencies

React, Tauri, Three.js, browser globals, Node filesystem APIs, C++/WASM bindings, product-domain packages, and plugin implementations.

## Commands

`pnpm --filter @cad-studio/platform-runtime typecheck`  
`pnpm --filter @cad-studio/platform-runtime test`
