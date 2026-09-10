# Project Runtime

## Purpose

`@cad-studio/project-runtime` is the COD-012 Project Runtime: authoritative coordinator for CAD project lifecycle (create, open, close, save, autosave, dirty tracking, recent projects).

It does **not** parse project files, import/export, render, or process geometry.

## Owner

CAD Studio Platform.

## Public API

Only `src/index.ts`. Primary entry: `ProjectRuntime`.

## Allowed dependencies

- `@cad-studio/platform-runtime`

## Commands

`pnpm --filter @cad-studio/project-runtime typecheck`  
`pnpm --filter @cad-studio/project-runtime test`

## Stability

**Experimental** (pre-PC-001).
