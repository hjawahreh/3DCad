# Display Preferences

Persisted under `localStorage` key `cad-studio.clinical.display.v1`.

## Fields

| Preference | Default |
|------------|---------|
| `displayMode` | `smooth` |
| `background` | `dark` |
| `lighting` | `studio` |
| `showGrid` / `showAxes` / `showOrigin` | true |
| `showBoundingBox` / `showModelEdges` / `showFaceOrientation` | false |
| `backfaceCulling` | true |
| `showOrientationIndicator` / `showScaleIndicator` / `showFrameStats` | true |
| `showHud` / `showOverlays` | true |

## API

```ts
workspace.viewport.preferences.get()
workspace.viewport.preferences.update({ displayMode: 'xray' })
workspace.viewport.appearance.setBackground('clinical-blue')
```

Updates notify React via `subscribe` + cached `ClinicalDisplayManager` snapshots (stable `useSyncExternalStore` identity until change).
