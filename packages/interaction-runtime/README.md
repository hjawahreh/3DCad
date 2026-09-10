# Interaction Runtime

## Purpose

`@cad-studio/interaction-runtime` is the COD-009 Interaction Runtime: it converts raw platform input into immutable interaction events for Tool Runtime consumers.

It owns **interaction routing only**. It does not implement camera navigation, selection, picking, manipulation, or CAD logic.

## Owner

CAD Studio Platform.

## Public API

Only `src/index.ts`. Primary entry: `InteractionRuntime`.

## Allowed dependencies

- `@cad-studio/platform-runtime`
- `@cad-studio/viewport-runtime` (viewport identity binding only)

## Prohibited

Scene mutation, Graphics Engine mutation, React, Three.js, tool-runtime, geometry, kernel, clinical packages.

## Commands

`pnpm --filter @cad-studio/interaction-runtime typecheck`  
`pnpm --filter @cad-studio/interaction-runtime test`

## Stability

**Experimental** (pre-PC-001).
