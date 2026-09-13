# PROD-002F — Full Tooth Segmentation Hardening

**Status:** READY (implementation) — browser PASS not claimed  
**Date:** 2026-09-12  
**Scope:** Production gate for Import → Preparation → Segmentation tooth instances

## Engine (reviewed, not rebuilt)

| Layer | Implementation |
|-------|----------------|
| Default provider | `ReferenceHeuristicProvider` — height-band + CC + crowding split (CPU) |
| Domain contract | `SegmentationProvider` → `SegmentationPrediction` (model-neutral) |
| Future ML | `OnnxSegmentationProvider` scaffold (`operational: false`) — same contract |
| Identification | 14-tooth FDI bank (`ARCH_ORDER_WITHOUT_WISDOM`); score capped ≤ 0.82 |
| Neighbors | Arch X-order links (`basis: arch-x-order`, `confidence: low`) — not contact |
| Local frames | AABB-corner PCA; confidence always `low` / `unavailable` |
| Cap | `MAX_CLINICAL_TOOTH_INSTANCES = 32`; merged residual → UNCERTAIN + WARNING |
| Validation | `clinical-seg-validation-v1.1` — overlap FAIL, bank/cap/neighbors honesty |

## Guarantees

- Operates on actual triangle geometry (no fake / hard-coded tooth positions)
- Stable `inst-NNN` IDs after X-sort
- Deterministic for identical mesh + archRole (timing/predictionId may differ)
- Limitations preserved via confidence, warnings, and validation — not hidden
- No claim of clinical-grade or licensed NN accuracy for the reference provider
- Upper/lower via `archRole`; ONNX can replace/augment without changing clinical types

## Explicit non-claims

- Not AI / research NN inference
- Not anatomical MD/BL/long-axis frames
- Not contact-aware neighbor graphs
- Touching / crowded / noisy meshes may under- or over-segment — surfaced as WARNING

## Automated gates

| Gate | Result |
|------|--------|
| typecheck | **PASS** |
| segmentation + clinical tests | **PASS** (294 clinical; PROD-002F 15/15) |
| build | **PASS** |
| architecture | **PASS** |
| lint (studio full) | **FAIL** — pre-existing strict typed-lint backlog (~1840 errors; PROD-002B) |
| PROD-001T regression | **PASS** (`prod-001t-vtk-integration` + loop3d asserts in PROD-002F) |
| Browser | **Not claimed** |

## Regression suite

`apps/studio/test/clinical/prod-002f-segmentation-hardening.test.ts`
