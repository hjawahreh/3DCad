# CLN-WORKSTATION-001 — Clinical Workstation UX Architecture

## Purpose

Reconstruct the clinician-facing workstation so the workflow feels:

**Import → Orient → Prepare → Trim → Base → Segment**

Interaction model:

**SELECT TOOL → DIRECT ACTION ON SCAN → RESULT**

Technical stages (validate / preview / commit) remain internal unless clinical confirmation is required.

## UX architecture

```
React (ClinicalShell)
  └─ Clinical Application / Workspace
       ├─ Tool Palette (left rail)
       ├─ Arch Context (top-right UPPER | BOTH | LOWER)
       ├─ Viewport-first DocumentHost
       │    ├─ Mesh viewport + Camera Runtime
       │    ├─ View Cube (screen-anchored)
       │    ├─ Active tool overlay + compact toolbar
       │    └─ Process feedback / notifications
       └─ Operation Runtime → Geometry Services → Kernel Bridge → Native Worker
```

UI never performs geometry. VTK / SurfacePath / ClinicalBaseEngine / segmentation providers are unchanged.

## Shell layout

| Region | Content |
|--------|---------|
| Top | Minimal application header |
| Left | Compact clinical tool palette (Orient, Trim, Base, Segment; future tools inert) |
| Center | Large uninterrupted dental viewport |
| Top-right | Arch control: UPPER / BOTH / LOWER (default BOTH) |
| Bottom-center | Active tool toolbar (Orient Scan / Trim / Base / Segment) |
| Bottom-right | View Cube (UPPER, ANTERIOR, POSTERIOR, LEFT, RIGHT, LOWER) |

Inspector and diagnostics stay collapsed unless opened (developer mode).

## Interaction state (Trim)

| Mode | Gesture | On pointer up |
|------|---------|---------------|
| Lasso | Freehand surface stroke | Close loop → trim compute → auto-accept if valid |
| Curve | Smooth SurfacePath stroke | Same as Lasso |
| Plane | Position cutting plane | Confirm → trim compute |

Internal pipeline on release:

`completeGestureAndTrim` → closeBoundary → preview (real mesh) → validate → accept when `canAcceptTrim` → notification “Trim complete” → Undo available.

Ambiguous / high-risk results keep Review semantics (status message; no forced Accept ritual for ordinary cuts).

## Base workflow

1. Select UPPER or LOWER  
2. Adjust Height (slider)  
3. **Create Base** → CREATING BASE… → live ClinicalBaseEngine V2 preview  
4. Accept / Done  

No AABB / slab helper in the viewport.

## Segmentation workflow

1. **Auto Segmentation (Beta)** — labeled Beta / Reference until ProductionModelProvider  
2. Stage messages: Preparing model → Detecting teeth → Separating gingiva → Identifying teeth → Building tooth regions  
3. Review: Semantic / Teeth / Review + Accept / Reject  

Must consume post-Trim / post-Base working geometry (PROD-002S fingerprint integrity).

Forbidden copy: “Clinically validated”, “Clinical accuracy”, “Ready for Treatment”.

## Camera & View Cube

- Single authoritative orbit mapping: `camera-orbit-mapping.ts` → `composition-root` once.  
- Drag up/down/left/right → matching view rotation.  
- View Cube faces drive `presentCanonicalClinicalView` with smooth fit.  
- Home / Auto Orient → BOTH + clinical anterior.

## Axis cleanup

Clinical defaults force `showAxes`, `showOrigin`, `showOrientationIndicator` off. Orientation overlay no longer renders X/Y/Z handles.

## Performance

Drawing remains immediate. Geometry work stays on Operation Runtime → Kernel Bridge → native worker. GEO-003 warmup preserved. Processing indicator shown during async ops; results are not faked.
