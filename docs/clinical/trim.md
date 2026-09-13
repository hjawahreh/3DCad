# Clinical Trim (Phase 4 — Production)

## Purpose

Production-grade clinical trim: select an arch, isolate it, draw a boundary (polyline / freehand), validate continuously, preview a **real** cut mesh through the geometry pipeline, commit with a CommitToken, and support multiple trims per arch with document undo/redo.

## Workflow

```
PREPARE → TRIM UPPER → TRIM LOWER → (later) CLOSE BASE
```

Within Trim:

1. Enter → `IDLE` (choose Polyline or Freehand)
2. Select Upper / Lower via the shared arch switcher
3. Active arch is isolated (inactive remains in the case — visibility only)
4. Draw on the visible mesh (viewport pointer ownership only)
5. Edit / Undo Pt / Clear / Close
6. Live + explicit Validate
7. Accept → Operation Runtime → Geometry Services → Kernel Bridge → CommitToken → Document → History → Scene republish
8. Remain in Trim for another cut, or switch arch, or Cancel to exit

## Arch switcher

`ClinicalArchSwitcher` (`apps/studio/src/clinical/shell/ClinicalArchSwitcher.tsx`) is the single reusable Upper/Lower control for Trim and later Close Base / Segmentation / Review / Analysis.

## Surface picking

Pointer → live canvas coordinates → Camera Runtime camera → ray → clinical mesh intersection → 3D surface point (`ClinicalMeshPicker`). No fixed 640×480 mapping.

## Algorithm

- Default: **`trim.exact-edge-clip`** — recursive exact triangle/edge splitting at boundary crossings, exterior fragments retained, Z via edge interpolation.
- Fallback: **`trim.centroid-polygon`** (legacy CLN-008) when explicitly requested.
- Boundary projection: mesh-surface XY (preferred) or live viewport screen → mesh AABB XY.
- Open3D adapter remains scaffolded (not linked); no GPL dependencies added.

## Commit path (frozen)

```
Boundary → Validation → ClinicalTrimOperation → GeometryServicesKernelPort
  → boolean.subtract → Kernel Bridge → exact trim → CommitToken
  → Clinical Document → Trim History → Scene republish (fitCamera: false)
```

Do not bypass Operation Runtime or call KernelBridge from trim UI modules.

## Validation

Checks: model, target arch, preparation stage, finite values, ≥3 points, closed, self-intersection (non-adjacent only), area, target surface, projection, kernel availability.

Actionable messages (examples):

- “Add at least 3 points.”
- “Close the boundary.”
- “Boundary crosses itself.”
- “Boundary is outside the active scan.”

Live validation surfaces obvious failures while drawing (no toast flood).

## History

| Layer | Control | Scope |
|-------|---------|--------|
| Drawing | Undo Pt / Clear / Reset | Boundary points only |
| Document | Undo / Redo | Accepted trim revisions |

## Camera

No camera reset after validate, preview, accept, cancel, undo, redo, or arch switch. Fit only on Trim enter (isolated arch) or explicit Fit.

## Multiple trims

Each Accept creates a revision and leaves Trim active (idle) on the same arch so the operator can draw again or switch arches.

## Limitations

- Open3D / native C++ trim path is scaffolded, not linked.
- Exact clip is XY-projected (clinical mesh frame); extreme undercuts may need future 3D clip.
- Browser visual acceptance of mesh delta remains operator-verified.
