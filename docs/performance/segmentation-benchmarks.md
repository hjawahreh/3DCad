# Segmentation Benchmarks (Phase 7)

```bash
pnpm --filter @cad-studio/studio test -- test/clinical/segmentation/segmentation.test.ts
```

## Harness

| API | Purpose |
|-----|---------|
| `runSegmentationBenchmarkSmoke()` | Preprocess / inference / postprocess / total / memory on small·medium·large **identical** synthetic fixtures |
| `buildSegmentationModelComparison()` | Repeatable comparison table for decision docs |

Timings are **not** CI gates.

## Smoke metrics (per fixture size)

- preprocessMs  
- inferenceMs  
- postprocessMs  
- totalMs  
- peakMemoryEstimate (mesh buffer bytes)  
- instances / success / failureRate  
- confidence means (semantic / instance / identification) when available  

## Model comparison columns

| Column | Meaning |
|--------|---------|
| Model | Provider / model id |
| Semantic quality | Face labeling quality note or N/A |
| Instance quality | Separation quality note or N/A |
| Identification quality | FDI / slot quality note or N/A |
| Boundary quality | Refinement note or N/A |
| Inference time | Measured or N/A |
| Memory | Estimate or N/A |
| Failure rate | Fixture failures |
| Calibration | Confidence calibration posture |

## Production default evidence

Only `reference-heuristic` is operational and measurable in-repo. Research NN candidates remain N/A until license-cleared ONNX weights exist — see `docs/architecture/segmentation-model-decision.md`.

## Large meshes

`planLargeMeshSampling()` provides stride sampling + chunking with **Model Input → Source Face** mapping preserved. Source mesh is never mutated.
