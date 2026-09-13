# Tooth Visualization (Phase 8)

Viewport-native visualization over the existing Three.js clinical mesh presenter.

## Modes

| Mode | Behavior |
|------|----------|
| Semantic | Gingiva / Tooth / Unknown (restrained palette) |
| Instance | Independent tooth colors; gingiva distinct |
| FDI | Instance colors + FDI sprites at instance centroids |
| Confidence | Muted confidence heatmap (never claims 100%) |
| Review | Instance colors + warning tint for uncertain/unknown |
| Boundary | Darkened uncertain borders for operator inspection |

## Interaction

- Click mesh face → select tooth instance  
- Inspector shows Identity / Confidence / Arch / Review  
- Relabel / Mark Unknown / Review actions  

## Performance

- One mesh per arch object (no per-tooth mesh duplication)  
- GPU vertex colors on a derived display geometry  
- ≤ ~32 FDI sprites (not thousands of React nodes)  

## Colors

Defined in `ClinicalSegmentationColors.ts` — enamel / gingiva / review tones, no neon.
