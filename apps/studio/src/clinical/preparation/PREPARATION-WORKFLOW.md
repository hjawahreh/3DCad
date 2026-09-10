# Preparation Workflow

```
Case Ready
  → Orientation Validation
  → Preparation Ready
  → Tool Selection
  → Preparation Session
  → Tool Activation
  → Validation
  → Complete
  → Ready For Geometry Tools
```

Preparation owns workflow orchestration only. No geometry execution.

## Stages

| Stage | Meaning |
|-------|---------|
| Orientation Complete | Orientation validated |
| Ready For Trim | Trim tool may be orchestrated |
| Ready For Close Base | Close base tool may be orchestrated |
| Ready For Segmentation | Segmentation tool may be orchestrated |
| Ready For Movement | Movement tool may be orchestrated |
| Preparation Complete | All preparation gates passed |

Each stage is immutable once recorded. Transitions are validated.

## Session Lifecycle

`Create → Activate → (Suspend ↔ Resume) → Complete | Cancel → Dispose`

Exactly one active preparation session at a time.

## Commands

- `clinical.preparation.start` (Mod+Shift+P)
- `clinical.preparation.validate`
- `clinical.preparation.activateSession`
- `clinical.preparation.advanceStage`
- `clinical.preparation.activateTool`
- `clinical.preparation.complete`
- `clinical.preparation.cancel`
