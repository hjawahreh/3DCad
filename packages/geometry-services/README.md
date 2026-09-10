# Geometry Services

## Purpose

`@cad-studio/geometry-services` is the platform package between Operation Runtime and the Kernel Bridge (ADR-0002 / COD-005). It owns geometric policy: algorithm selection, kernel request shaping, Kernel Session caches, and result validation. It never mutates the document.

## Owner

CAD Studio Platform / Geometry.

## Public API

Only `src/index.ts` is public: `GeometryServices`, `KernelSession`, `MockKernelBridge`, service stubs and types.

## Allowed dependencies

`@cad-studio/platform-runtime`, `@cad-studio/kernel-bridge`, and the TypeScript standard library.

## Prohibited dependencies

React, Three.js, Domain, viewport, Operation Runtime internals (callers depend on this package, not the reverse), Tauri, and native kernel bindings (bridge is injected).

## Commands

`pnpm --filter @cad-studio/geometry-services typecheck`  
`pnpm --filter @cad-studio/geometry-services test`
