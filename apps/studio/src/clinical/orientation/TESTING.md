# Testing (CLN-004 Orientation)

```bash
pnpm --filter @cad-studio/studio test
pnpm --filter @cad-studio/studio typecheck
```

## Suites (`test/clinical/orientation.test.ts`)

- Workflow
- Transform math
- Preview (non-mutating)
- Commit
- History
- Undo/Redo
- Gizmo
- Diagnostics
- Architecture
- Smoke

## Constraints

- No mesh topology APIs in `orientation/`
- Platform packages unmodified
- Document mutation only on Accept / Undo / Redo
