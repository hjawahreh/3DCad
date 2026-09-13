# Auto Segmentation (Phase 8)

One-click clinical tooth segmentation on a prepared case.

## Experience

```
Prepared case
  → Segment Teeth
  → Segmenting case (honest progress)
  → Rebuilding… (derived display)
  → Review Teeth
  → Accept Segmentation
```

Progress copy is operator-facing (no provider internals):

- Preparing dental surface  
- Analyzing anatomy  
- Separating teeth  
- Identifying teeth  
- Refining boundaries  
- Reconstructing clinical model  

## Commands

| Action | Command |
|--------|---------|
| Segment Teeth (enter + run) | `clinical.tool.segmentation` / `clinical.segmentation.run` |
| Accept | `clinical.segmentation.accept` |
| Reject / Cancel | `clinical.segmentation.reject` / `cancel` |

## Architecture

Uses Phase 7 provider registry unchanged:

```
Clinical Segmentation Runtime → Provider → Prediction → Review → Commit
```

Accept stores compact `segmentationMeta` only (provider, model, versions, FDI list, confidence, source revision). No tensors.

## Arch switching

Shared `ClinicalArchSwitcher` isolates Upper/Lower presentation — same pattern as Trim / Close Base.

## Failure

Original scan remains untouched. Actions: Retry · Choose Another Model · Review Diagnostics.
