# Segmentation Model Decision (Phase 7)

**Status:** Production default selected  
**Date:** 2026-09-11  
**Decision owner:** Clinical CAD architecture

## Decision

**Production default provider:** `reference-heuristic` (`clinical-reference-seg` v1.1.0)

**Not selected as default:** TSegFormer, MeshSegNet, TGNet, DentalMAE, or ONNX Runtime scaffold.

## Criteria applied

| Criterion | Result |
|-----------|--------|
| Benchmark on identical fixtures | Only `reference-heuristic` produces measurable preprocess / inference / postprocess timings in-repo |
| License review | Research NN code/weights/datasets not cleared for bundling (see `model-licensing.md`) |
| Runtime compatibility | No PyTorch in React; no Python clinical dependency. ONNX Web optional, not installed |
| Memory evaluation | Heuristic uses mesh buffers only; NN weights would add multi‑MB/GB payloads — not shipped |
| Failure testing | Research adapters fail closed (`MODEL_UNAVAILABLE`); ONNX scaffold fails closed; cancel leaves document unchanged |

## Candidate summary

| Model | Why not default |
|-------|-----------------|
| **MeshSegNet** | Strongest *future* candidate (code MIT). Weights not redistributed; needs ONNX export + browser benchmarks + FDI mapping. Dataset unavailable upstream. |
| **TSegFormer** | Public research code; SPDX / weights / dataset commercial terms not cleared. |
| **TGNet** | External checkpoints; license/dataset terms not cleared. |
| **DentalMAE** | Code/weights redistribution not verified. |
| **ONNX Runtime scaffold** | Provider wired (`onnx-runtime`) with WebGPU→WASM→CPU capability reporting; remains `operational: false` until license-cleared `.onnx` + optional runtime enablement. |

## Production path

```
Prepared model
  → Provider Registry (default: reference-heuristic)
  → Preprocess (CLN-008/009 mapping preserved; large-mesh sample plan available)
  → Infer (CPU geometry inference)
  → Instance separation + identification
  → Human review
  → Commit (metadata only; compact clinical document)
```

## Explicit non-goals (this decision)

- Do **not** silently switch provider/model when GPU is unavailable.
- Do **not** bundle unlicensed weights.
- Do **not** claim research-paper headline accuracy for the default provider.
- Do **not** introduce PyTorch or Python into the clinical workflow.

## Revisit triggers

Promote an NN provider to default only when **all** are true:

1. License clearance recorded in `model-licensing.md`
2. ONNX (or equivalent) browser runtime verified (WebGPU / WASM / CPU)
3. Repeatable fixture benchmark beats or matches heuristic on semantic / instance / identification / boundary / failure rate / calibration
4. Memory within Studio budget
5. Cancel + failure paths leave clinical document untouched

Until then, `reference-heuristic` remains the sole operational production model.
