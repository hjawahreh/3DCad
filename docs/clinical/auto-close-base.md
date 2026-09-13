# Clinical Auto Close Base

**Algorithm version:** `clinical-auto-close-base-v1`  
**Module:** `apps/studio/src/clinical/close-base/ClinicalAutoCloseBaseEstimator.ts`

## Purpose

After Trim, provide **one-click** automatic base generation:

```
Trimmed model → Analyze → Estimate → Preview → Accept
```

Never silently commits. Accept is always explicit.

## UX

### Create Base

Your trimmed model is ready.

- **Auto Create Base** (primary)
- **Adjust Manually** (secondary)

### Auto Base Preview

- **Accept**
- **Adjust**
- **Cancel**

## Pipeline

1. Boundary detection (open edges)
2. Boundary / mesh quality diagnostics
3. Surface / AABB analysis
4. Strategy selection (`plane` | `offset` | `surface`)
5. Parameter estimation (height, thickness, offset, orientation)
6. Base generation via existing Close Base Operation Runtime path (`preview: true`)
7. Quality check
8. Preview only — user Accept to commit

## Parameter estimation

Deterministic from mesh scale and topology:

- **Orientation** — prefer clinical inferior (`xz` / −Y); fall back to flattest axis
- **Strategy** — plane for typical trim openings; offset for large perimeters; surface for tiny/no openings
- **Height / thickness / offset** — fractions of model spans, clamped by `AUTO_CLOSE_BASE_SAFETY`

Not a single hard-coded parameter set for every scan.

## Safety

Hard clamps in `AUTO_CLOSE_BASE_SAFETY`. Catastrophic / too-small / invalid meshes return:

> Automatic base generation needs review.

Then **Adjust Manually** — original trimmed model unchanged; workflow not advanced.

## Architecture

Reuses Close Base commit spine. Auto mode only estimates parameters and calls preview. Accept still goes:

Operation Runtime → Geometry Services → Kernel Bridge → CommitToken → Document → History

## Progress

`Analyzing model…` → `Creating base…` → `Checking result…`

## Persistence

Accepted results persist via the existing case save path (working mesh + descriptors).
