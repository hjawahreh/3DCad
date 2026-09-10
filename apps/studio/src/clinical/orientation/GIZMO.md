# Orientation Gizmo

Professional overlay gizmo integrated with certified Interaction Runtime.

## Features

- Drag handles for X / Y / Z / Free
- Hover + active handle highlighting
- Axis rotation guides + world axis labels
- Visual pivot marker
- Snap preview styling
- Pointer capture via `InteractionSession.capturePointer`

## Integration

Handle pointer-down starts a gizmo drag and captures the pointer owner `clinical-orientation-gizmo`.

Subsequent pointer move/up events from Interaction Runtime (and DOM fallback on the overlay) update the live preview transform.

Camera navigation remains available when not dragging a handle.
