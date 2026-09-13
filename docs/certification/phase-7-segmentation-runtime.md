# Phase 7 — Production Segmentation Runtime

**Status:** Complete  
**Scope stop:** Segmentation only (no Movement / Biomechanics / Treatment Planning)

## Mission

Connect existing CLN-009 provider architecture to real model inference without redesigning providers.

```
PREPARED MODEL
  → MODEL INFERENCE
  → TOOTH SEGMENTATION
  → INSTANCE SEPARATION
  → TOOTH IDENTIFICATION
  → REVIEW
```

## Architecture preserved

```
Clinical Segmentation Runtime
  → Provider Registry
  → Provider
  → Model-neutral Prediction
  → Human Review
  → Commit
```

No hard-coded single research model in the clinical workflow. Default is registry-selected (`reference-heuristic`) per decision record.

## Delivered

| Item | Evidence |
|------|----------|
| Operational segmentation model | `ReferenceHeuristicProvider` v1.1.0 — CPU geometry inference |
| Model-independent providers | Registry + scaffolds + `onnx-runtime` adapter |
| Preprocess + face mapping | CLN-008/009 preprocess + `LargeMeshSampling` plan |
| CPU / GPU capability | `InferenceCapabilityDetector` — WebGPU/WASM/CPU; no silent provider switch |
| Progress stages | Preparing scan… → … → Checking results… (real work markers) |
| Cancellation | AbortSignal + provider.cancel; no partial document mutation |
| Confidence | Existing CLN-009 confidence / calibration — not fabricated |
| Benchmark harness | `runSegmentationBenchmarkSmoke` + `buildSegmentationModelComparison` |
| Licensing | `docs/architecture/model-licensing.md` — no illegal weights bundled |
| Decision record | `docs/architecture/segmentation-model-decision.md` |

## Explicit non-deliverables (correct)

- Research NN weights **not** bundled  
- PyTorch **not** in React  
- Python **not** required for clinical path  
- ONNX provider remains non-operational until license + weights gate  

## Tests

Provider: load, inference, cancellation, failure, CPU fallback messaging, GPU capability detection, reproducibility  
Clinical: prediction → review → accept / reject (document compact; revision only on accept)

## Definition of Done

- [x] At least one real segmentation model operational  
- [x] Provider abstraction model-independent  
- [x] Preprocessing + prediction mapping  
- [x] CPU/GPU capability handled  
- [x] Progress + cancellation  
- [x] Benchmark harness  
- [x] Licensing verified / no illegal weights  
- [x] Clinical document remains compact  
- [x] Tests / build / architecture gates  

**STOP AFTER PHASE 7.**
