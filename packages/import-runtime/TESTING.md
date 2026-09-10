# Testing

## Levels

- Lifecycle, validation, plug-in registry, progress, cancellation
- Diagnostics / metrics
- Concurrent sessions
- Architecture (deps, reserved parsers, no Three/parser code)
- Integration (project session binding + passthrough importer)

## Performance expectations

- Deterministic lifecycle
- Concurrent sessions up to configured max
- Minimal allocations; frozen snapshots
- Stable progress event ordering
- Sessions dispose without leaks (cancel + clear)

## Commands

`pnpm --filter @cad-studio/import-runtime test`

## Known limitations

- No built-in STL/OBJ/… parsers (plug-ins own them)
- File existence is a host metadata contract (`exists=false`)
- Document model is descriptor-only (no mesh buffers)
