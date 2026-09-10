# Viewport Overlay & HUD

## Overlay (`ClinicalViewportOverlay`)

| Region | Content |
|--------|---------|
| Origin / axes | World origin marker + RGB axes |
| Orientation gizmo | Corner XYZ indicator |
| Scale bar | 10 mm placeholder |
| Bounding box hint | Optional dashed frame |
| Badge | Case name, visibility counts, selection, import status |
| Tool / measure | Reserved overlay regions (no measurement logic) |

Toggled via `showOverlays` and individual preference flags.

## HUD (`ClinicalViewportHUD`)

| Field | Source |
|-------|--------|
| FPS / Δ ms / Frames | Viewport session metrics |
| Tris | Sum of descriptor `faceCount` (metadata) |
| Objs / Sel | Document + selection session |
| Cam | Render state camera mode / last preset |
| Disp | Current display mode |
| Imp | Import coordinator phase |

Toggled via `showHud` / `showFrameStats`. Overlay and HUD are pointer-events: none to preserve camera navigation.
