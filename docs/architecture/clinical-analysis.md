# Architecture — Clinical Analysis (CLN-010)

## Location

`apps/studio/src/clinical/analysis/`

## Reused infrastructure

| Concern | Source |
|---------|--------|
| Mesh buffers | `ClinicalGeometryKernelBridge.registry` (CLN-008) |
| Spatial queries | `buildSpatialIndex` / KD nearest vertex |
| Vectors | `@cad-studio/camera-runtime` math |
| Transforms | Existing scene `Mat4` / clinical orientation math |
| Tooth instances | Segmentation prediction snapshot (CLN-009) |
| Commands / tools / UI shell | Existing clinical registry + DocumentHost |

## Not modified

- Platform packages
- Operation Runtime contracts (analysis is observational; no commit handler required)
- Geometry Services / Kernel Bridge algorithms
- Segmentation architecture

## Cache key

`analysisType | sourceRevision | segmentationRevision | fingerprint | algorithmVersion | parametersHash`

## New dependencies

None. No Eigen/Open3D/nanoflann npm packages added for CLN-010.
