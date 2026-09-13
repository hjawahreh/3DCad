# Architecture — Clinical Orientation

## Layers (do not conflate)

1. **Source geometry** — immutable MeshRegistry source buffers  
2. **Clinical orientation transform** — `ClinicalMeshDescriptor.transform` (Mat4), case-level for auto  
3. **Camera presentation** — Camera Runtime eye/target/up; `ClinicalAnteriorCamera`

## Reused infrastructure

- `ClinicalOrientationRuntime` / Controller / Session / Manager / History / Gizmo  
- Analysis `principalAxesFromPoints` (no new PCA library, no Open3D)  
- Camera Runtime `fitAll` + `animateTo`  
- Preparation handoff: `notifyOrientationComplete` → `start()`

## Extensions (Phase 2)

- `ClinicalAutoOrientationEstimator`  
- Case-level preview/accept (`applyCaseTransform`)  
- `ClinicalDocumentSnapshot.orientationMeta`  
- Commands: `clinical.orientation.auto`  
- Transform-aware `unionOrientedBounds` for fit

## Forbidden

- Mutating source mesh topology for orientation  
- Independent upper/lower orientation that breaks bite  
- Parallel orientation engine or second camera runtime  
- Auto Preparation / Trim / Close Base / Segmentation in this phase
