# Camera Runtime

## Purpose

`@cad-studio/camera-runtime` is the COD-010 Camera Runtime: it owns camera state, projection, navigation orchestration, and viewport synchronization.

It does **not** render, select, pick, mutate Scene data, or perform CAD operations.

## Owner

CAD Studio Rendering.

## Public API

Only `src/index.ts`. Primary entry: `CameraRuntime`.

## Allowed dependencies

- `@cad-studio/platform-runtime`
- `@cad-studio/viewport-runtime`
- `@cad-studio/interaction-runtime`

## Commands

`pnpm --filter @cad-studio/camera-runtime typecheck`  
`pnpm --filter @cad-studio/camera-runtime test`

## Stability

**Experimental** (pre-PC-001).
