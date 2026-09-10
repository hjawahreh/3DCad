# Orientation Workflow

```
Import Model
  → Enter Orientation Tool
  → Show Orientation Gizmo
  → Free / Axis / Snap / Incremental rotation
  → Live Preview (document unchanged)
  → Accept → Commit Transform → Document + History
  → Complete
```

Cancel is allowed from every non-terminal phase and restores the last committed document via scene republish (preview discarded).

## Modes

| Mode | Behavior |
|------|----------|
| Free Rotate | Gizmo free handle / unconstrained axis |
| Rotate Around X/Y/Z | Axis-locked delta |
| Incremental | ±1° / ±5° / ±15° |
| Snap to World Axes | Quantize rotation to 90° |
| Reset Orientation | Preview → identity |

## Commit

On Accept:

1. Apply `preview` Mat4 to `ClinicalMeshDescriptor.transform`
2. Push history entry (previous/next document snapshots)
3. Mark case dirty
4. Refresh viewport **without** camera fit
5. Deactivate tool
