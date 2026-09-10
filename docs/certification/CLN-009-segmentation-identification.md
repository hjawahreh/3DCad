# Release Certification Report

**Milestone:** CLN-009 — Production Tooth Segmentation, Instance Separation & Identification  
**Package(s):** `apps/studio/src/clinical/segmentation`  
**Stability target:** Experimental (decision-support infrastructure)  
**Author:** platform engineering  
**Date:** 2026-09-10  

---

## Scope

- [x] Model-independent provider registry and contract  
- [x] Preprocessing with source face mappings  
- [x] Semantic + instance prediction schema  
- [x] Tooth identification + FDI utilities  
- [x] Confidence bands + calibration tracker  
- [x] Human review (relabel / merge / split / unknown)  
- [x] Non-destructive preview; accept via Operation Runtime  
- [x] Benchmark smoke harness  
- [x] Licensing documentation  
- [x] Tests + docs  

**Not claimed:** clinically validated neural production accuracy.

## Architecture

Clinical Segmentation Runtime → Provider Registry → Provider → model-neutral prediction → review → CommitToken → document metadata revision.  
Platform packages unmodified. Reuses CLN-008 geometry kernel for mesh access.

## Provider system

| Provider | Operational |
|----------|-------------|
| reference-heuristic | Yes |
| tsegformer | No (scaffold) |
| meshsegnet | No (scaffold) |
| tgnet | No (scaffold) |
| dentalmae | No (scaffold) |

## Models evaluated / operational

Research adapters registered for future benchmark-first selection. Only the first-party reference heuristic is operational in CLN-009.

## Preprocessing / postprocessing / identification

- Preprocess: validate, normals, face centroids, sample→face mapping  
- Instance separation: connected components + crowding X-gap split  
- Boundary refinement: neighbor voting for low-confidence faces  
- Identification: arch-slot FDI candidates; UNCERTAIN below threshold  

## Confidence / human review

Multi-level confidence with non-guarantee wording. Review merge/split/relabel before accept.

## Performance

Benchmark smoke (synthetic meshes) covered in tests — timings machine-dependent, not CI-gated.

## Licensing

Documented in `docs/architecture/model-licensing.md`. No unlicensed weights or patient datasets shipped.

## Tests

```bash
pnpm --filter @cad-studio/studio typecheck  → exit 0
pnpm --filter @cad-studio/studio test       → 12 files, 115 tests passed
pnpm --filter @cad-studio/studio build      → exit 0
```

Includes `test/clinical/segmentation/segmentation.test.ts` (12 tests).

## Architecture verification

- [x] Platform packages untouched  
- [x] No PyTorch/ONNX in clinical UI modules  
- [x] Failed/rejected inference does not mutate document  
- [x] Accept creates one revision with compact metadata  

## Known limitations

- Neural research models not operational (no weights/runtime)  
- Reference heuristic is decision-support geometry only — not clinically validated  
- Exact learned instance IDs deferred to verified model providers  
- 3DTeethSeg dataset adapters documented conceptually; datasets not included  

## Certification status

**PASS WITH OBSERVATIONS**

Observations: production default NN remains unselected pending license-verified weights and benchmark-first comparison; infrastructure is model-replaceable as required.
