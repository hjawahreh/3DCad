# Close Base Workflow

```
Activate Close Base
  → Validate Clinical Case
  → Select Base Strategy
  → Configure Parameters
  → Preview (non-destructive)
  → Validate
  → Start Operation
  → Geometry Services
  → Kernel Bridge
  → Validate Result
  → Commit + CommitToken
  → History
  → Scene Republish (camera preserved)
  → Workflow Gate Advance
  → Complete
```

Cancellation is allowed before commit. Failed kernel runs produce **no** CommitToken, command, document revision, or workflow advance.

## Tool status

`not-ready` · `ready` · `previewing` · `validating` · `processing` · `committed` · `cancelled` · `failed`

## Commands

- `clinical.tool.closeBase` (Mod+B)
- `clinical.closeBase.accept` / `cancel` / `reset` / `undo` / `redo`
- `clinical.closeBase.strategy.plane` / `surface`
- `clinical.closeBase.parameter.*`
