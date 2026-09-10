# Import Runtime Architecture

```text
ImportRequest
  → ImportValidator
  → ImportPluginRegistry.resolve
  → ImporterPlugin.import (external plug-in)
  → ImmutableImportedDocument
  → ImmutableImportSnapshot
```

## Principles

- Runtime coordinates only — parsers are plug-ins.
- No Scene / Viewport / Graphics / geometry mutation.
- STL/OBJ/PLY/OFF/3MF/GLTF/STEP/IGES are **reserved parser contracts**.
- Concurrent sessions supported; each session is single-owner.

## Plug-in model

`ImporterPlugin` reports capabilities (extensions, MIME, priority) and implements `import()` without this package containing parser code. Hosts register plug-ins via `ImportPluginRegistry` / `ImportFactory`.

## Thread model

Runtime may create concurrent sessions. Do not share a live `ImportSession` across threads. Published snapshots are immutable.

## Ownership

Caller owns source refs and plug-in implementations. Runtime owns session orchestration until `dispose()`.
