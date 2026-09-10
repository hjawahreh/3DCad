# Tooth Local Coordinate Systems

## Convention (estimated — not clinically authoritative)

| Axis | Intended meaning | Current estimator |
|------|------------------|-------------------|
| Origin | Tooth centroid | Area-weighted face centroid (fallback: geometric mean) |
| X | Mesiodistal | PCA axis most aligned with optional arch tangent |
| Z | Apicocoronal | World +Z orthogonalized against X |
| Y | Buccolingual | Z × X |

**Algorithm version:** `toothFrame` `1.0.0` (`pca-arch-heuristic`)

## Explicit non-claims

Automatic axes are geometric estimates. They are not validated anatomical axes.

## Evolution

The `AnalysisFrame` contract (`origin`, `x`, `y`, `z`, `method`, `version`) allows future anatomical conventions without breaking callers.
