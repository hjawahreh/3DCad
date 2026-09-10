# Testing (CLN-003 Display)

```bash
pnpm --filter @cad-studio/studio test
pnpm --filter @cad-studio/studio typecheck
```

## Suites (`test/clinical/display.test.ts`)

- Display mode switching + metrics
- Camera fit / reset / presets
- Overlay & HUD preference toggles
- Visibility hide / isolate / show all
- Preference persistence (memory store)
- Diagnostics counters
- Architecture (no platform package edits; no mesh algorithms)
- Smoke (commands registered)

## Constraints verified

- No geometry modification APIs in display module
- Platform packages untouched
- Viewport refresh does not call fitCamera on mode change
