# GEO-003A

## View Cube

Screen-space CSS 3D cube (`ClinicalViewCube`) remains a Camera Runtime consumer via
`presentClinicalCubeView` / `presentCanonicalClinicalView` / `resetView`.

Faces: Anterior (`front`), Posterior (`back`), Left, Right, Top/Occlusal, Bottom/Inf.
Edges and corners navigate intermediate poses (`presentClinicalCubeCorner`).
Home ≡ Anterior clinical default.

Cube is viewport-corner anchored (`right/bottom: 12px`, `z-index: 7`), does not move with geometry.

## Canonical Clinical Views

Anterior / Home / Auto Orient share `CANONICAL_CLINICAL_ANTERIOR_FACE = 'front'` with mild elevation.
No separate “Front” meaning for clinical Home.

## Mouse Navigation Mapping

**Single authoritative mapping:** `apps/studio/src/application/camera-orbit-mapping.ts`

```
screenDeltaToOrbitRadians(dx, dy) → { yaw: -dx * 0.005, pitch: -dy * 0.005 }
```

Wired once in `StudioCompositionRoot.wireCameraNavigation`.
No sign flips in Interaction Runtime or OrbitController.

| Drag | Screen Δ | Orbit | Eye result (from anterior) |
| --- | --- | --- | --- |
| Right | +dx | −yaw | eye.x decreases |
| Left | −dx | +yaw | eye.x increases |
| Up | −dy | +pitch | eye.y increases |
| Down | +dy | −pitch | eye.y decreases |

## Orbit

Existing spherical orbit model preserved; only screen→yaw/pitch signs corrected.

## Pan

Unchanged: Shift / secondary → `camera.pan(dx, dy)` (PanController signs).

## Zoom

Unchanged: wheel up → in, wheel down → out.

## Axis Cleanup

Clinical defaults (display prefs `v2`):

- `showAxes: false`
- `showOrigin: false`
- `showOrientationIndicator: false`

Normal clinical viewport does **not** mount:

- center XYZ CSS axes (`clinical-axes-helper`)
- bottom-corner XYZ badge (`clinical-orient-gizmo`)

Internal clinical frames / camera basis / transforms unchanged.

## Diagnostics Mode

Display panel toggles:

- Axes (diagnostics)
- Origin (diagnostics)
- XYZ badge (diagnostics)

Same overlay path — no second render pipeline.

## Trim Interaction Isolation

| Layer | z-index |
| --- | --- |
| View Cube | 7 (+ `stopPropagation`) |
| Trim overlay (armed) | 5 |
| Camera (viewport) | below |

Trim armed → drawing owns pointer; cube still clickable when pointer is over the cube.

## Real Dental Evidence

Playwright walkthrough on real upper (261k) + lower (234k):

- BOTH after Auto Orient + Prepare
- Axes helpers **not mounted** (`axesHelper:false`, `orientGizmo:false`, `data-axes=off`)
- View Cube present (`viewCube:true`)

## Screenshots

`docs/certification/geo-003a-browser-shots/`:

| File | Content |
| --- | --- |
| 01-clinical-clean.png | Anterior BOTH, no XYZ axes/gizmo |
| 02–07 | Ant / Post / L / R / Top / Bottom |
| 08-home.png | Home ≡ Anterior |
| 09–12 | Orbit up / down / left / right |

## Automated Tests

`test/clinical/geometry/geo-003a-viewport-navigation.test.ts` — 8/8 passed.
`view-cube.test.ts`, `prod-002sc-canonical-anterior.test.ts` — passed.
Typecheck — passed.

## Remaining Observations

1. Edge/corner hit targets remain small; primary clinical navigation uses face clicks + Home.
2. Orbit evidence in screenshots uses Camera Runtime with the same authoritative sign mapping as `wireCameraNavigation`.

## Certification

**PASS WITH OBSERVATIONS**

- Orbit inversion fixed at one authoritative layer
- View Cube remains Camera Runtime consumer; Anterior ≡ Home
- Clinical XYZ overlays off by default; diagnostics re-enable
- Trim / zoom / pan contracts preserved
- Real dental screenshots + DOM mount checks green

DO NOT CLAIM CLINICAL CERTIFICATION.
