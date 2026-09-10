# Tool Runtime (Operation Runtime)

## Purpose

First-class **Operation Runtime** between Application and Domain. Owns registry, executor, validation pipeline, progress, cancellation, retry, result validation, commit coordination, diagnostics, and metrics. Never mutates the document. See ADR-0001 / ARCHITECTURE.md §17.

## Owner

CAD Studio Platform / Architecture.

## Public API

`src/index.ts` only — `OperationHost` and supporting types/modules.

## Allowed dependencies

`@cad-studio/platform-runtime`, TypeScript standard library.

## Prohibited dependencies

React, Three.js, Tauri, viewport internals, domain stores, clinical geometry.

## Commands

`pnpm --filter @cad-studio/tool-runtime typecheck`  
`pnpm --filter @cad-studio/tool-runtime test`
