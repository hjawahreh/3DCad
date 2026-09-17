# Model & Dataset Licensing (CLN-SEG-001 update)

A research GitHub repo being “open” does **not** authorize clinical redistribution of weights or patient-derived data.

**Policy:** Do not bundle unlicensed weights. No proprietary commercial CAD code is copied. No PyTorch in React — inference runs in an isolated Python worker when configured.

| Asset | Source code license | Weights license | Dataset license | Commercial use | Redistribution | Inference runtime | Production |
|-------|---------------------|-----------------|-----------------|----------------|----------------|-------------------|------------|
| Reference heuristic (`reference-heuristic`) | Project license | N/A (no NN weights) | N/A | Engineering / Dev only | Yes (project) | CPU (browser/Node) | **No — REFERENCE / Development only** |
| ProductionModelProvider + seg worker | Project + MIT adapter boundary | Requires cleared checkpoint | Requires cleared dataset | Only when gate cleared | Weights not bundled | Python worker · CUDA GPU or CPU | **Unavailable until configured** |
| ONNX Runtime Web (optional peer) | Microsoft MIT (upstream package) | N/A (runtime only) | N/A | Yes (runtime) | Via npm when enabled | WebGPU / WASM / CPU | Runtime only — **not enabled** until weights cleared |
| MeshSegNet | **MIT** (Tai-Hsien/MeshSegNet LICENSE) | Upstream models — **not copied**; redistribution requires confirmation | Training data **not provided** upstream | Code: yes under MIT | Weights: **not redistributed here** | PyTorch upstream; candidate ONNX export | **No** |
| TSegFormer | **MIT** (`huiminxiong/TSegFormer`) commit `7784e0c9c5a4` | Pretrained weights **not published** for download; local `best_model.t7` from training — **not cleared** for product bundling | Large private IOS corpus (paper) — **not available** | Code: yes under MIT | Weights/dataset: **not authorized here** | PyTorch via isolated worker | **Candidate only — gate closed** |
| TGNet / ToothGroupNetwork | Research repo; **SPDX not cleared** | External Drive checkpoints — **not bundled** | Challenge/dataset terms apply | Not authorized here | Not authorized | PyTorch | **No** |
| DentalMAE | Paper method; **code/weights not verified** | Not verified | Not verified | Not authorized here | Not authorized | Research stack | **No** |
| 3DTeethSeg-style datasets | — | — | Challenge/dataset terms | Per challenge | **Not committed** | — | **Not included** |

## Enablement gate (ProductionModelProvider)

An NN provider may become `operational: true` only after:

1. License row updated to **cleared** for code + weights + dataset obligations  
2. Weights hosted under an approved redistribution path (not illegally copied)  
3. Isolated worker (or approved runtime) verified — device reported honestly  
4. Benchmark + failure + cancel tests pass  
5. Decision recorded in `segmentation-model-decision.md` and `CLN-SEG-001-production-segmentation.md`

Until then, Production remains registered but non-operational and must expose **“Production model not configured.”** Never substitute the heuristic as Production.
