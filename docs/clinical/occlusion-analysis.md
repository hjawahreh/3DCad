# Occlusion Analysis Foundation

CLN-010 provides an **occlusion foundation only**.

## Implemented

- Requires upper + lower meshes when available
- Closest-point / sampled vertex nearest-neighbor distance (reuses CLN-008 spatial index)
- Contact *candidates* when distance &lt; 0.5 mm

## Not implemented

- Full occlusal simulation
- Force / torque / biomechanics
- Geometry modification

## Validity

Missing upper or lower → `INCOMPLETE`.
