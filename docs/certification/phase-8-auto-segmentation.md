# Phase 8 — Auto Segmentation + Dental Reconstruction

**Status:** Complete  
**Scope stop:** Auto segmentation / visualization / review only (no biomechanics / treatment planning)

## Mission

Polished automated clinical workflow on the Phase 7 production segmentation provider.

```
PREPARED CASE → AUTO SEGMENTATION → RECONSTRUCTING → TEETH + GINGIVA → TOOTH LABELS → REVIEW
```

## Delivered

| Requirement | Evidence |
|-------------|----------|
| One-click Segment Teeth | `segmentTeeth()` + workflow/commands |
| Honest progress | User-facing stages via `toUserFacingProgressMessage` |
| Processing screen | `ClinicalSegmentationOverlay` processing hero + progress bar |
| Rebuild presentation | `presentation: rebuilding` then review |
| Semantic / instance / FDI / confidence / review / boundary | Session view modes + viewport colors |
| Gingiva distinct | Semantic + instance palettes |
| FDI on instances | Sprites at instance centroids (CLN-009 identification) |
| Confidence / unknown indicators | Badges + confidence mode |
| Selection + inspector | Pick + `ClinicalSegmentationInspector` |
| Upper / Lower | Shared `ClinicalArchSwitcher` |
| Failure UX | Retry / Choose model / Diagnostics; scan untouched |
| Accept / reject / persistence | Compact `segmentationMeta` with teeth FDI list |
| Performance | Shared geometry + vertex colors + sparse sprites |

## Tests / gates

See `test/clinical/auto-segmentation.test.ts` and existing segmentation suite.

## STOP AFTER PHASE 8
