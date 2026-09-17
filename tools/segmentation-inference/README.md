# CLN-SEG-001 segmentation inference worker

Isolated Python sidecar for production dental segmentation (TSegFormer).

## Architecture

```
Clinical Application
  → Segmentation Runtime (TypeScript)
  → Model Adapter / ProductionModelProvider
  → Python inference worker (this package)
  → Production Model (TSegFormer)
```

React never imports PyTorch.

## Legal / reproducibility gate

| Field | Value |
|-------|-------|
| modelName | TSegFormer |
| repository | https://github.com/huiminxiong/TSegFormer |
| license | MIT (code) |
| checkpointSource | Upstream does **not** publish a redistributable pretrained URL; local `best_model.t7` from training |
| checkpointLicense | **Not cleared** for product bundling until explicitly registered |
| trainingDataset | Private IOS corpus (paper) |
| datasetLicense | **Not available / not cleared** |

Until `CAD_SEG_CHECKPOINT` points at a legally obtained checkpoint **and**
`CAD_TSEGFORMER_ROOT` points at a local MIT checkout, the worker reports:

`Production model not configured.`

The clinical UI must **not** substitute the reference heuristic as Production.

## Start (unconfigured — safe)

```bash
python3 tools/segmentation-inference/seg_worker_http.py
# listens on http://127.0.0.1:8766
curl http://127.0.0.1:8766/health
```

## Start (configured — real inference)

```bash
export CAD_TSEGFORMER_ROOT=/path/to/TSegFormer   # MIT checkout
export CAD_SEG_CHECKPOINT=/path/to/best_model.t7
export CAD_SEG_WORKER_PORT=8766
# optional:
# export CAD_SEG_FORCE_CPU=1
# export CAD_SEG_MODEL_VERSION=my-build
python3 tools/segmentation-inference/seg_worker_http.py
```

## Dependencies

See `requirements.txt`. Torch is required only when a checkpoint is configured.

## Endpoints

- `GET /health` — configured / operational / device
- `POST /infer` — mesh positions+indices → labels + toothInstances (503 if not configured)
