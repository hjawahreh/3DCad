# Trim Workflow

```
Activate Trim
  → Acquire Pointer
  → Draw Boundary
  → Generate Preview Boundary
  → Validate
  → Submit Operation
  → Operation Runtime
  → Geometry Services
  → Kernel Bridge
  → Validated Result
  → Commit
  → History Entry
  → Viewport Refresh
  → Complete
```

Every stage is cancellable via `clinical.trim.cancel` or toolbar Cancel.

## Commands

- `clinical.tool.trim` (Mod+T)
- `clinical.trim.accept` (Enter)
- `clinical.trim.cancel`
- `clinical.trim.undo` / `clinical.trim.redo`
