# Clinical Orientation (CLN-004)

Orient imported models into treatment coordinate space by **transform only**. No mesh topology changes.

## Components

| Type | Role |
|------|------|
| `ClinicalOrientationRuntime` | Public façade |
| `ClinicalOrientationSession` | Live preview state |
| `ClinicalOrientationWorkflow` | Phase machine + cancel |
| `ClinicalOrientationController` | Enter / rotate / accept / history |
| `ClinicalOrientationManager` | Document commit helpers |
| `ClinicalOrientationGizmo` | Drag handles + Interaction Runtime capture |
| `ClinicalOrientationHistory` | Transform-only undo/redo |
| Diagnostics / Metrics | Sessions, accepts, snaps, axis usage |

## Docs

- [ORIENTATION-WORKFLOW.md](./ORIENTATION-WORKFLOW.md)
- [GIZMO.md](./GIZMO.md)
- [HISTORY.md](./HISTORY.md)
- [TESTING.md](./TESTING.md)

## Forbidden

Trim, close base, segmentation, tooth movement, manufacturing, mesh editing.
