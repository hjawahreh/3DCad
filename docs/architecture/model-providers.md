# Model Providers

Clinical segmentation uses a **provider registry**. The clinical layer consumes only model-neutral predictions.

```
Clinical Segmentation Runtime
  → Provider Registry
  → Provider (capabilities / model info / preprocess / infer / postprocess / cancel / runtime info)
  → Model-neutral Prediction
  → Human Review
  → Commit
```

| Provider | Operational | Runtime | Notes |
|----------|-------------|---------|-------|
| `reference-heuristic` | **Yes (default)** | CPU | First-party geometry inference — production default per `segmentation-model-decision.md` |
| `onnx-runtime` | No | WebGPU / WASM / CPU (detected) | Scaffold; weights not bundled; fails closed |
| `tsegformer` | No | — | Research adapter scaffold |
| `meshsegnet` | No | — | Research adapter scaffold (code MIT upstream; not enabled) |
| `tgnet` | No | — | Research adapter scaffold |
| `dentalmae` | No | — | Research adapter scaffold |

## Provider contract

Each provider exposes:

- `capabilities()`
- `modelInformation()` / `info`
- `runtimeInformation()` — preferred EP, GPU availability, CPU fallback message
- `preprocess` — never mutates source mesh; preserves Model Input → Source Face mapping
- `infer` — cancel-aware; progress stages are real work markers
- `postprocess` (optional)
- `cancel` / `dispose`
- Failure states via `SegmentationError` (`MODEL_UNAVAILABLE`, `CANCELLED`, …)

## Runtime policy

- Detect WebGPU / WASM / CPU via `InferenceCapabilityDetector` (adapter layer).
- If GPU unavailable: show CPU fallback for providers that support it.
- **Never** silently change the selected provider/model when capabilities change.
- Clinical UI / React modules must not import PyTorch, TensorFlow, or ONNX tensors.
- Optional ONNX Runtime is adapter-only and not a hard dependency.

## Progress stages (operational providers)

Preparing scan… → Loading segmentation model… → Analyzing dental surface… → Separating teeth… → Identifying teeth… → Refining boundaries… → Checking results…

## Related

- `docs/architecture/segmentation-model-decision.md`
- `docs/architecture/model-licensing.md`
- `docs/performance/segmentation-benchmarks.md`
