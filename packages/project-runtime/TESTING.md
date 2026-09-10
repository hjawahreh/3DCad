# Testing

## Levels

- Lifecycle, dirty-state, autosave, recent projects, snapshots, diagnostics
- Architecture (single platform-runtime dependency, reserved channels)
- Integration (create → dirty → save without I/O)

## Performance expectations

- Deterministic lifecycle transitions
- O(1) session lookup via registry map
- Immutable frozen snapshots
- Injectable scheduler for stable autosave tests
- Minimal allocations on clean save paths

## Commands

`pnpm --filter @cad-studio/project-runtime test`

## Known limitations

- No file format read/write (host / COD-013 import)
- Cloud sync and collaboration reserved
- Autosave does not serialize bytes — emits save contracts only
