# Selection Runtime Architecture

```text
Host opaque target IDs
        ↓
SelectionFilter → SelectionPolicy
        ↓
SelectionManager (pending → commit)
        ↓
ImmutableSelectionSnapshot
        ↓
SelectionHistory entry (for Platform undo hooks)
SelectionClipboard (references only)
```

## Principles

- Selection stores stable opaque ids + revision; never mutates Scene/Graphics/Camera.
- No hit testing or GPU picking in this package (reserved contracts).
- History contributes immutable entries; does not own global undo/redo.
- Clipboard holds selection references only — no geometry serialization.

## Thread model

Single-owner per runtime/session. No hidden globals. Published snapshots are immutable and safe to share after publication.

## Ownership

Caller owns target id identity semantics. Runtime owns session selection state until `dispose()`.
