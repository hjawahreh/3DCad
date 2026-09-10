# Clinical Close Base (CLN-008)

## Purpose

Create a clinically useful base-supported model from a trimmed open dental surface. Deterministic, measurable, and committed only through Operation Runtime.

## Strategies

| Id | Geometry Services | Behavior |
|----|-------------------|----------|
| `plane` | `offset.uniform` | Extrude walls from open boundary to a plane; triangulate base |
| `offset` | `offset.uniform` | Same kernel path; controlled offset parameters |
| `surface` | `repair.fill-holes` | Fan/ear-clip fill of boundary loops in place |

Future solid/printable strategies remain extensible without changing the Operation Runtime contract.

## Pipeline

Trimmed / working mesh → boundary detection → strategy + parameter validation → preview geometry → topology/quality validation → accept → CommitToken → history → document revision → scene republish.

## Quality checks

Post-generation quality pipeline reports boundary edges, components, degenerates, normals-related warnings, and fingerprints. Automatic destructive repair is not performed without explicit user intent.

## Limitations

- Smoothing remains a payload flag (no global remesh of protected clinical surfaces).
- Watertightness is strategy-dependent; plane base aims for closure via walls + base.
- GPL CGAL algorithms are not integrated.
