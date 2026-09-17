# CLN-WORKFLOW-002 — Clinical Workflow Reconstruction

Guided orthodontic CAD workflow:

```
Import → Auto Orientation → Prepare → Trim → Base → Segment
  (Mark Teeth → Auto → Adjust → Verify) → Next (Biomech locked)
```

## Principles

- Clinician always knows: where am I / what now / what next
- Only the current stage exposes its main controls
- Prepare is a pipeline stage, not a destination
- Preserve VTK / ClinicalGeometryEngine / validation quality
- Do not start Movement or Biomechanics
- Segmentation may remain BETA / REFERENCE until ProductionModelProvider is validated

## Import

Create Case shows: Creating case → Loading scans → Preparing geometry → Ready.  
Default presentation: BOTH + clinical anterior fit.

## Orientation

Accept Orientation freezes the frame, runs prepare + warmup, then opens Trim (UPPER).  
Canonical pose: `clinicalAnteriorPose` / `presentCanonicalClinicalView('front')` — shared by Auto Orient, Home, View Cube FRONT.

## Orbit

Single mapping in `camera-orbit-mapping.ts`:

- yaw = −dx × sensitivity  
- pitch = −dy × sensitivity  

## View Cube

Compact 3D cube: UPPER / FRONT / BACK / LOWER / LEFT / RIGHT + HOME. Camera Runtime only. No XYZ gizmo in clinical view.

## Trim

- One arch only (never BOTH)
- Modes: Plane / Lasso / Curve
- Release → close → compute → commit (no Accept ritual)
- Unlimited trims per arch; Clear redraws; Done → Base

## Base

- One arch; Height + Create Base + Done
- Create Base auto-commits (no separate Accept)
- Lower triangulation hardened (interior seed + ear-clip retry)
- Done → Segmentation

## Segmentation (guided)

1. Edit Scans  
2. Mark Teeth (surface markers)  
3. Auto Segmentation  
4. Adjust Boundaries  
5. Verify Teeth → Accept / NEXT (Biomech locked)

## Persistence

Workflow stage inferred from document meta on reopen (`hydrateClinicalPipelineFromDocument`).

### Mark Teeth persistence contract (CLN-WORKFLOW-002A)

| State | Persistence |
|-------|-------------|
| **Mark Teeth markers** (`ClinicalSegmentationSession.toothMarkers`) | **Session-live only** — temporary inference inputs for Auto Segmentation. Cleared when the segmentation session begins/clears. **Not** written to case save schema. |
| **Accepted segmentation** (`object.segmentationMeta`: faceMembership, teeth FDI, providerId, geometryFingerprint, status) | **Persisted** with the case document. Recoverable after Save/Reopen. |

Do **not** imply marker recoverability after Save/Reopen. Markers are not clinical state; accepted segmentation/instances are.

## Non-goals

Movement, Biomechanics, VTK replacement, fabricated clinical accuracy claims.
