# Project Runtime Architecture

```text
Host (UI / persistence adapters)
        ↓
ProjectRuntime / ProjectSession
        ↓
Lifecycle: create → open → load → activate → modify → dirty → autosave/save → close
        ↓
ImmutableProjectSnapshot + history transition entries
RecentProjectsRegistry
```

## Principles

- Project Runtime owns project state transitions only.
- No command execution, geometry, rendering, or file parsing.
- Save/autosave emit contracts; host performs persistence I/O.
- Cloud sync / collaboration / version server / multi-user are **reserved**.

## Dirty model

`modify()` bumps document revision and marks dirty. `save()` / successful autosave clear dirty. Close while dirty fails unless `force=true`.

## Thread model

Single-owner per runtime/session. No hidden globals. Published snapshots are immutable.

## Ownership

Caller owns location refs and persistence. Runtime owns session state until `dispose()`.
