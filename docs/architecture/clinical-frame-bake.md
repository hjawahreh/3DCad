# Architecture — Clinical Frame Bake Policy

**Status:** Adopted for PROD-002 (transform-only with mesh-local geometry ops)  
**Baseline:** PROD-001T PASS  

## Decision

**Do not bake orientation into MeshRegistry buffers by default.**

| Layer | Authority |
|-------|-----------|
| Source mesh buffers | Immutable scanner-space MeshRegistry `source` |
| Working mesh buffers | Topology from geometry ops only (trim/close-base); still mesh-local |
| Clinical orientation | `ClinicalMeshDescriptor.transform` (Mat4) + `orientationMeta` |
| Viewport / picking | World = transform(mesh-local); picks expose both `world*` and `local*` |
| Geometry ops (Trim / Close Base / Segmentation features) | **Mesh-local coordinates** |

## Why

1. Preserves bite relationship (single case-level rigid transform).  
2. Avoids silent topology mutation when operators undo orientation.  
3. Matches PROD-001T fix: VTK `loop3d` prefers `localX/Y/Z` so oriented cases clip correctly.  
4. Keeps source fingerprints stable for persistence identity.

## Rules

1. Geometry backends receive mesh-local positions/indices and mesh-local loop/plane data.  
2. Display applies `transform` in the viewport only.  
3. Future tooth movement must compose tooth-local frames with the clinical transform — never assume AABB orientation when clinical orientation is present.  
4. Optional bake (copy transformed positions into working) requires an explicit future API, CommitToken, history entry, and new certification — **not** enabled here.

## Downstream consumers

- Trim: `ClinicalTrimLoop3d` → mesh-local `loop3d`  
- Close Base: clinical `planeNormal` / `preferRequestedOrientation`  
- Segmentation preprocess: mesh-local face centroids/normals  
- Handoff snapshot: records orientation metadata + geometry fingerprints without baking  

## Forbidden

- Silently replacing source buffers with oriented coordinates  
- Using AABB axes as cut authority when clinical orientation exists  
- Coupling clinical modules to VTK types for frame math  
