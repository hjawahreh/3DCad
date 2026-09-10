# Scene Projection Engine

## Purpose

`@cad-studio/scene` is the COD-007 Scene Projection Engine: an immutable projection runtime that transforms Domain document revisions into transient render snapshots for the Graphics Engine.

## Owner

CAD Studio Platform / Rendering.

## Public API

Only `src/index.ts`. Primary entry: `SceneProjectionEngine.project(documentRevision)`.

## Allowed dependencies

`@cad-studio/platform-runtime` (Result) and TypeScript standard library.

## Prohibited dependencies

React, Three.js, viewport/GPU, Rust/Tauri, filesystem, geometry-services, kernel-bridge, clinical packages.

## Commands

`pnpm --filter @cad-studio/scene typecheck`  
`pnpm --filter @cad-studio/scene test`

## Stability

**Experimental** (pre-PC-001).
