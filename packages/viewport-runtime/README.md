# Viewport Runtime

## Purpose

`@cad-studio/viewport-runtime` is the COD-008 Viewport Runtime: it hosts and orchestrates the Graphics Engine (`@cad-studio/viewport`) and consumes immutable `SceneSnapshot` values from `@cad-studio/scene`.

It coordinates canvas, session lifecycle, frame scheduling, backend selection, and presentation. It does **not** render geometry, own CAD logic, or create Three.js objects.

## Owner

CAD Studio Rendering.

## Public API

Only `src/index.ts`. Primary entry: `ViewportRuntime`.

## Allowed dependencies

- `@cad-studio/platform-runtime`
- `@cad-studio/scene`
- `@cad-studio/viewport` (Graphics Engine public contracts)

## Prohibited

React, Three.js imports, kernel, geometry-services, tool-runtime, clinical packages.

## Commands

`pnpm --filter @cad-studio/viewport-runtime typecheck`  
`pnpm --filter @cad-studio/viewport-runtime test`

## Stability

**Experimental** (pre-PC-001).
