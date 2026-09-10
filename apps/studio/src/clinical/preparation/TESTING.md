# Testing (CLN-005 Preparation)

```bash
pnpm --filter @cad-studio/studio test -- test/clinical/preparation.test.ts
pnpm --filter @cad-studio/studio typecheck
```

## Suites (`test/clinical/preparation.test.ts`)

- **workflow** — phase machine + end-to-end orchestration
- **stages** — immutable stage transitions
- **validation** — immutable reports + gate checks
- **session** — create / activate / suspend / resume / cancel / complete
- **pipeline** — tool registry + compatibility
- **diagnostics** — sessions, stages, failures, duration
- **architecture** — no geometry / topology / THREE imports
- **smoke** — bootstrap + commands registered

## Prerequisites for start()

1. Active case with imported mesh
2. Viewport attached
3. Orientation completed (accept orientation or history entry)
