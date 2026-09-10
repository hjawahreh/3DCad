# Clinical Display Pipeline (CLN-003)

Professional clinical viewport & display layer over certified Camera + Viewport runtimes.

**No geometry modification. No trim. No segmentation. No clinical algorithms.**

## Components

| Type | Role |
|------|------|
| `ClinicalViewportRuntime` | Façade: display mode, visibility, camera fit/presets |
| `ClinicalDisplayPipeline` | Scene republish with visibility + display metadata |
| `ClinicalDisplayManager` | Immediate mode switching + cached render state |
| `ClinicalRenderState` | Immutable display snapshot |
| `ClinicalDisplayPreferences` | Persisted per-user prefs (localStorage) |
| `ClinicalVisibilityManager` | Hide / Show / Isolate / Show All |
| `ClinicalAppearanceManager` | Background, grid, lighting, edges, culling |
| `ClinicalViewportOverlay` | Orientation, axes, scale, selection badge |
| `ClinicalViewportHUD` | FPS, tris, objects, camera/display mode |
| `ClinicalDisplayDiagnostics` | Mode/visibility/camera/refresh logs |
| `ClinicalDisplayMetrics` | Opens, fits, mode usage, frame times |

## Docs

- [DISPLAY-PIPELINE.md](./DISPLAY-PIPELINE.md)
- [VIEWPORT-HUD.md](./VIEWPORT-HUD.md)
- [DISPLAY-PREFERENCES.md](./DISPLAY-PREFERENCES.md)
- [TESTING.md](./TESTING.md)

## Boundary

Platform packages are **not** modified. Shading modes that the certified viewport cannot express natively are presented via clinical CSS + scene entity `display` metadata.
