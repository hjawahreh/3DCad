# Selection Runtime

## Purpose

`@cad-studio/selection-runtime` is the COD-011 Selection Runtime: it owns immutable selection state and selection lifecycle for opaque host-supplied target identifiers.

It does **not** perform hit testing, picking, or geometry queries.

## Owner

CAD Studio Platform.

## Public API

Only `src/index.ts`. Primary entry: `SelectionRuntime`.

## Allowed dependencies

- `@cad-studio/platform-runtime`
- `@cad-studio/interaction-runtime`

## Commands

`pnpm --filter @cad-studio/selection-runtime typecheck`  
`pnpm --filter @cad-studio/selection-runtime test`

## Stability

**Experimental** (pre-PC-001).
