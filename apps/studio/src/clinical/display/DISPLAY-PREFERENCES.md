# Display Preferences

Persisted under `localStorage` key `cad-studio.clinical.display.v2` (GEO-003A bumped from v1).

## Fields

| Preference | Default |
|------------|---------|
| `displayMode` | `smooth` |
| `background` | `dark` |
| `lighting` | `studio` |
| `showGrid` | true |
| `showAxes` / `showOrigin` / `showOrientationIndicator` | **false** (clinical clean; enable via Display panel for diagnostics) |
| `showBoundingBox` / `showModelEdges` / `showFaceOrientation` | false |
| `backfaceCulling` | true |
| `showScaleIndicator` / `showFrameStats` | true / false |
| `showHud` / `showOverlays` | true |

## API

```ts
workspace.viewport.preferences.get()
workspace.viewport.preferences.update({ displayMode: 'xray' })
workspace.viewport.appearance.setBackground('clinical-blue')
workspace.viewport.appearance.setAxes(true) // diagnostics only
```

Updates notify React via `subscribe` + cached `ClinicalDisplayManager` snapshots (stable `useSyncExternalStore` identity until change).
