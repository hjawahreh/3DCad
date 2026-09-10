# Testing

## Levels

- Lifecycle, modes, policies, clipboard, history, snapshots, diagnostics
- Architecture (deps, reserved channels, dispose)
- Integration (interaction session binding)

## Performance expectations

- Deterministic ordering (stable insertion / preserved order)
- O(1) membership via Set
- Immutable frozen snapshots
- Minimal allocations on no-op paths
- Bounded history buffer

## Commands

`pnpm --filter @cad-studio/selection-runtime test`

## Known limitations

- Lasso / paint / smart / AI / GPU picking reserved only
- Range selection contract-only
- Global application undo owned by host (entries contributed here)
