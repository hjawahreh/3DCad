# Clinical Measurements

## Units

| Quantity | Canonical | Display |
|----------|-----------|---------|
| Length | mm | `X.XX mm` |
| Angle | degrees | `X.X°` |

Computational values never mix display units.

## Distance

- **Euclidean** — straight-line 3D distance between two points (`distance` / `1.0.0`)
- **Surface-path** — Dijkstra on mesh vertex adjacency (`surfacePath` / `1.0.0`)

Surface-path is never labeled as Euclidean.

## Angle

Point A → Vertex → Point B in 3D. Range 0–180°.

## Tolerances

See `ANALYSIS_TOLERANCE` in `apps/studio/src/clinical/analysis/units.ts`.

## Validity

| State | Meaning |
|-------|---------|
| VALID | Completed with sufficient data |
| WARNING | Usable but requires review |
| INCOMPLETE | Required teeth/data missing |
| INVALID | Geometry unsuitable |
