# Testing

## Levels

- Unit / routing: pointer, mouse, keyboard, wheel, touch
- Capture, hover, focus, diagnostics
- Lifecycle
- Architecture: dependency allowlist, reserved channels, dispose
- Integration: viewport id binding without viewport mutation

## Performance expectations

- Deterministic ordered dispatch
- Minimal allocations (frozen event objects; coalesced queue)
- No dropped events under normal load (`dropWhenFull: false` default)
- Input/dispatch latency recorded in metrics

## Commands

`pnpm --filter @cad-studio/interaction-runtime test`

## Known limitations

- No hit-testing / picking (by constitution for COD-009)
- Advanced gestures, pen tilt/twist, VR reserved only
- Host must supply opaque `targetId` values when hover routing is desired
