# Viewport

## Purpose

`@cad-studio/viewport` is the imperative rendering engine. It owns GPU backends, the render graph, frame execution, GPU resources, materials, shaders, pass scheduling, and related services. It contains no product-domain, scene-graph, camera, or UI behavior.

## Owner

CAD Studio Rendering team (`OWNERS.toml`).

## Public API

Only `src/index.ts` is public. Consumers create sessions through `createRenderer` / `RendererFactory`. No consumer constructs GPU backends or resource managers directly except in tests that intentionally exercise those units.

## Allowed dependencies

TypeScript standard library, `@cad-studio/platform-runtime` (Result helpers), and Three.js as a backend adapter implementation detail.

## Prohibited dependencies

React (may host the canvas only outside this package), Tauri, Node filesystem APIs, product-domain packages, scene/camera/navigation packages, and plugin implementations.

## Commands

`pnpm --filter @cad-studio/viewport typecheck`  
`pnpm --filter @cad-studio/viewport test`
