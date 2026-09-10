# Model Providers

| Provider | Operational | Notes |
|----------|-------------|-------|
| reference-heuristic | Yes | First-party deterministic heuristic |
| tsegformer | No | Adapter scaffold |
| meshsegnet | No | Adapter scaffold |
| tgnet | No | Adapter scaffold |
| dentalmae | No | Adapter scaffold |

Contract: `initialize`, `capabilities`, `validateInput`, `preprocess`, `infer`, `cancel`, `dispose`.

Clinical code must not import PyTorch/ONNX tensors.
