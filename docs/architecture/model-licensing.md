# Model & Dataset Licensing (Phase 7)

A research GitHub repo being “open” does **not** authorize clinical redistribution of weights or patient-derived data.

**Policy:** Do not bundle unlicensed weights. No proprietary commercial CAD code is copied. No PyTorch in React.

| Asset | Source code license | Weights license | Dataset license | Commercial use | Redistribution | Inference runtime | Production |
|-------|---------------------|-----------------|-----------------|----------------|----------------|-------------------|------------|
| Reference heuristic (`reference-heuristic`) | Project license | N/A (no NN weights) | N/A | Yes | Yes (project) | CPU (browser/Node) | **Yes (default)** |
| ONNX Runtime Web (optional peer) | Microsoft MIT (upstream package) | N/A (runtime only) | N/A | Yes (runtime) | Via npm when enabled | WebGPU / WASM / CPU | Runtime only — **not enabled** until weights cleared |
| MeshSegNet | **MIT** (Tai-Hsien/MeshSegNet LICENSE) | Upstream repo includes models — **not copied into this tree**; redistribution requires separate confirmation | Training data **not provided** upstream | Code: yes under MIT | Weights: **not redistributed here** | PyTorch upstream; candidate ONNX export | **No** |
| TSegFormer | Public research code; **SPDX not cleared** in review | Pretrained weights terms **unclear / not cleared** | Large private IOS corpus (paper) — **not available** | Not authorized here | Not authorized | PyTorch | **No** |
| TGNet / ToothGroupNetwork | Research repo; **SPDX not cleared** | External Drive checkpoints — **not bundled** | Challenge/dataset terms apply | Not authorized here | Not authorized | PyTorch | **No** |
| DentalMAE | Paper method; **code/weights not verified** | Not verified | Not verified | Not authorized here | Not authorized | Research stack | **No** |
| 3DTeethSeg-style datasets | — | — | Challenge/dataset terms | Per challenge | **Not committed** | — | **Not included** |

## Enablement gate

An NN provider may become `operational: true` only after:

1. License row updated to **cleared** for code + weights + dataset obligations  
2. Weights hosted under an approved redistribution path (not illegally copied)  
3. Browser-safe runtime (ONNX or equivalent) verified  
4. Benchmark + failure + cancel tests pass  
5. Decision recorded in `segmentation-model-decision.md`

Until then, scaffolds remain registered but non-operational.
