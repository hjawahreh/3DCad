# Display Pipeline

## Flow

```
ClinicalViewportRuntime
  → ClinicalDisplayManager (prefs + render state)
  → ClinicalDisplayPipeline.refresh
      → ClinicalSceneBuilder.buildAndPublish (fitCamera=false)
      → viewport.invalidate(reason)
```

## Display modes

`solid` · `wireframe` · `solid-wireframe` · `xray` · `hidden-edge` · `flat` · `smooth`

Switching is immediate: preferences update → cached render state → pipeline refresh → CSS host class.

## Visibility

Descriptor-level only (`ClinicalMeshDescriptor.visible` / `displayState`). Pipeline republishes scene entities; no buffer edits.

## Camera

Delegates to certified `CameraSession`:

- `fitAll` / `fitSelected` (future-ready; falls back to fitAll)
- `resetView`
- `presetView`: front, back, left, right, top, bottom, iso

## Forbidden

Orientation workflow, trim, close base, segmentation, measurements, mesh editing.
