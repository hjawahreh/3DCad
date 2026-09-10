# Clinical Segmentation (CLN-009)

## Architecture

```text
Clinical Segmentation Runtime
  → Provider Registry
  → Provider (reference-heuristic | research scaffolds)
  → Preprocess → Infer → Postprocess → Identify
  → Human Review
  → Accept (Operation Runtime CommitToken)
  → Clinical Document Revision (metadata only)
```

Models are replaceable providers. The clinical workflow does not hard-code TSegFormer, MeshSegNet, TGNet, or DentalMAE.

## Operational provider

| Id | Status |
|----|--------|
| `reference-heuristic` | **Operational** — deterministic geometry heuristic for tests/benchmarks |
| `tsegformer` / `meshsegnet` / `tgnet` / `dentalmae` | Scaffold only — `MODEL_UNAVAILABLE` until weights/runtime/license verified |

## Invariants

- Source mesh immutable
- Prediction non-destructive until accept
- Failed/rejected inference → no document revision
- FDI never forced below confidence threshold
- No tensors in clinical document
