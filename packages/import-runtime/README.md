# Import Runtime

## Purpose

`@cad-studio/import-runtime` is the COD-013 Import Runtime: it orchestrates import workflows from external files into immutable platform document models via importer plug-ins.

It does **not** parse files, process geometry, or mutate Scene/Viewport/Graphics.

## Owner

CAD Studio Platform.

## Public API

Only `src/index.ts`. Primary entry: `ImportRuntime`.

## Allowed dependencies

- `@cad-studio/platform-runtime`
- `@cad-studio/project-runtime`

## Commands

`pnpm --filter @cad-studio/import-runtime typecheck`  
`pnpm --filter @cad-studio/import-runtime test`

## Stability

**Experimental** (pre-PC-001).
