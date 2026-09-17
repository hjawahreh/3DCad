# Segmentation Model Decision (CLN-SEG-001)

**Status:** Production NN slot defined; checkpoint gate closed  
**Date:** 2026-09-16  
**Decision owner:** Clinical CAD architecture

## Decision

| Role | Provider |
|------|----------|
| **Production slot** | `production-clinical-model` (`ProductionModelProvider`) — real inference via Python worker **when configured** |
| **Reference / Development** | `reference-heuristic` — **REFERENCE HEURISTIC** for engineering / UI pipeline tests only |
| **Default when Production unavailable** | `reference-heuristic` (visually marked; never claimed clinically accurate) |
| **Default when Production operational** | `production-clinical-model` |

## Criteria applied

| Criterion | Result |
|-----------|--------|
| Real model inference | Worker + TSegFormer adapter path implemented; refuses fake NN output |
| License review | TSegFormer **code MIT**; checkpoint + dataset **not cleared** → Production unavailable |
| Runtime isolation | No PyTorch in React; `tools/segmentation-inference/seg_worker_http.py` |
| Failure testing | Unconfigured Production fails closed (`Production model not configured.`) |
| No silent fallback | Heuristic never labeled as Production |

## Candidate summary

| Model | Status |
|-------|--------|
| **TSegFormer** | Preferred research candidate (MIT code). Enable when checkpoint + dataset obligations cleared and `CAD_SEG_CHECKPOINT` / `CAD_TSEGFORMER_ROOT` set. |
| **MeshSegNet** | Future ONNX candidate; weights not redistributed. |
| **Reference heuristic** | Development only. |

## Production path

```
Final prepared model
  → geometryFingerprint verify
  → ProductionModelProvider (if operational)
  → Segmentation worker
  → TSegFormer
  → instances + FDI + gingiva
  → Review / Tooth Numbering
  → Accept (persist membership + provenance)
```

## Explicit non-goals

- Do **not** start Movement / biomechanics in this milestone
- Do **not** modify Trim geometry or redesign Close Base
- Do **not** claim Clinically Validated without completed clinical evaluation
- Do **not** bundle unlicensed weights

## Revisit triggers

Promote Production to operational default when **all** are true:

1. License clearance recorded in `model-licensing.md`
2. Cleared checkpoint path configured and worker load verified
3. Fixture / held-out benchmark recorded
4. Cancel + failure paths leave clinical document untouched
