# Architecture — Studio Host

## Boundary

`apps/studio` is the APP-001 composition root. Platform packages remain authoritative for domain/runtime behavior. The host:

1. Instantiates runtimes
2. Owns the canvas DOM element
3. Forwards input to Interaction Runtime
4. Surfaces project/import/viewport status in the shell UI

## Layering

```
Tauri window / native menus
        ↓
React StudioShell (layout, dialogs, palette)
        ↓
StudioApplication → StudioBootstrap → StudioCompositionRoot
        ↓
Platform runtimes (project, import, viewport, interaction, camera, selection, scene, tools, geometry, kernel)
```

## Forbidden in this package

- Mesh parsing / format readers beyond reserved plug-in contracts
- Geometry algorithms
- Clinical workflows (trim, segmentation, tooth movement, manufacturing)
- Moving platform logic into the app

## Naming note

Constitution documents historically referenced `apps/desktop`. APP-001 formalizes the executable host as `apps/studio` (see ADR-0006).
