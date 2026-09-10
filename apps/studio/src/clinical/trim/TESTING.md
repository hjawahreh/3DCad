# Testing (CLN-006 Trim)

```bash
pnpm --filter @cad-studio/studio test -- test/clinical/trim.test.ts
pnpm --filter @cad-studio/studio typecheck
```

## Suites

- workflow, boundary, preview, validation, commit, history, undo/redo
- operation runtime integration, geometry services integration
- architecture, smoke

## Prerequisites

1. Active case with imported mesh
2. Orientation accepted
3. Preparation advanced to `ready-for-trim` (or complete)
