# Testing (CLN-007 Close Base)

```bash
pnpm --filter @cad-studio/studio typecheck
pnpm --filter @cad-studio/studio test -- test/clinical/close-base.test.ts
pnpm --filter @cad-studio/studio test
```

## Suites

Workflow, lifecycle, parameters, strategy, validation, preview, Operation Runtime, Geometry Services, commit, history, undo/redo, cancellation, failure/no-mutation, preparation gate, architecture, smoke.

## Prerequisites for accept()

1. Active case with imported mesh
2. Orientation accepted
3. Preparation advanced to `ready-for-close-base`
