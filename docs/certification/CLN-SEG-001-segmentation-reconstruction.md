# CLN-SEG-001

## Model

TSegFormer (MICCAI 2023) evaluated as the production candidate behind `ProductionModelProvider`.

Reference heuristic retained strictly as **REFERENCE HEURISTIC (Development)** for engineering / UI pipeline tests.

## License

- Code: MIT (`https://github.com/huiminxiong/TSegFormer`, commit `7784e0c9c5a4` @ review)
- Checkpoint redistribution: **not cleared**
- Dataset: **not available / not cleared**

## Checkpoint

**Not configured in this tree.**

`ProductionModelProvider` / worker health:

`Production model not configured.`

REAL-MODEL inference requires operator-supplied `CAD_SEG_CHECKPOINT` + `CAD_TSEGFORMER_ROOT`.

## Dataset

No held-out annotated ground truth bundled. BENCHMARK cannot PASS without cleared GT.

## Input Preparation

Final prepared geometry only; fingerprint gated.

## Inference

Isolated Python worker at `tools/segmentation-inference/seg_worker_http.py` (default `:8766`).

## Postprocessing

Deterministic island drop, label projection, boundary metrics, LOW_CONFIDENCE flags.

## Tooth Instances

Mapped to scan faces/vertices; no fabricated geometry.

## Gingiva

Semantic label 0; distinct material.

## FDI

ISO 3950 permanent set; missing stays missing.

## Reconstruction

Colored presentation of original prepared mesh; FDI labels + Tooth Numbering panel.

## Visualization

Professional restrained palette; no neon rainbow; no giant yellow circles; surface boundaries.

## Performance

Reported by worker when operational (cold/warm). Unconfigured: N/A.

## Benchmark Metrics

Adapter expanded (`serializeTeethSeg22Benchmark`, predicted labels/instances/FDI). Metrics run only with GT — not patient-facing.

## Human Review

Manual review mandatory on a real scan (boundaries, gingiva, FDI, missing, select, upper/lower, orbit, zoom).

## Persistence

Face membership + provenance + fingerprint; reopen reconstructs from membership.

## Browser Evidence

Script: `docs/certification/cln-seg-001-browser-walkthrough.mjs`

Shots (target):

01-final-prepared-model · 02-auto-segmentation-processing · 03-segmented-front · 04-segmented-occlusal · 05-fdi-numbering · 06-selected-tooth · 07-upper · 08-lower · 09-reopened

## Remaining Limitations

1. Production checkpoint not configured → REAL-MODEL cannot PASS
2. No cleared GT → BENCHMARK cannot PASS
3. CLINICAL validation not claimed

## Certification

| Gate | Result |
|------|--------|
| ENGINEERING | **PASS WITH OBSERVATIONS** — architecture, worker, UI, persistence, honest unavailable Production path |
| REAL-MODEL | **FAIL** (expected) — no cleared checkpoint configured |
| BENCHMARK | **FAIL** (expected) — no held-out GT |
| CLINICAL | **NOT CLAIMED** |

**Overall: PASS WITH OBSERVATIONS**

Observations:

- Heuristic is visually marked REFERENCE / Development and never labeled Production
- Production path fails closed with explicit message
- Clinical review UI (AUTO SEGMENTATION → Review → Tooth Numbering → Accept) is in place
- Manual screenshot capture on a real case remains required for visual sign-off
