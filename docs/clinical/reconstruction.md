# Clinical Reconstruction Presentation (Phase 8)

“Reconstruction” in Studio means **derived clinical display**, not replacement of authoritative geometry.

## Rules

- Original mesh / source topology / source revision are preserved in the kernel registry.
- Segmentation prediction references source faces; it does not duplicate vertex buffers into the clinical document.
- Viewport may rebuild a **non-indexed colored display mesh** for visualization only.
- Accept commits metadata (`segmentationMeta`) — never model weights or face tensors.

## Rebuild UX

After inference:

1. Presentation status → `rebuilding`  
2. “Rebuilding… Reconstructing teeth and gingiva.”  
3. Face colors + FDI sprites applied in `ClinicalMeshViewport`  
4. Presentation status → `review`

The app stays responsive (`requestAnimationFrame` / async yields); it must not freeze.
