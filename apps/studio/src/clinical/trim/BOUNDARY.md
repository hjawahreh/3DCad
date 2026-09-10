# Boundary Drawing

## Modes

| Mode | Behavior |
|------|----------|
| Polyline | Click to add vertices |
| Freehand | Drag to sample points (min 4px spacing) |

## Controls

- **Undo Pt** — remove last vertex
- **Clear** — reset boundary
- **Close** — snap first/last vertex (12px threshold)
- **Validate** — run immutable validation report

## Validation

Closed boundary, minimum 3 points, no self-intersection, model available, preparation stage `ready-for-trim`+, kernel pipeline available.

Preview is overlay-only — no document mutation until commit.
