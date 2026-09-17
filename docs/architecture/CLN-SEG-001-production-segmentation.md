# CLN-SEG-001 — Production Segmentation Architecture

## Model

**Candidate:** TSegFormer (MICCAI 2023) — geometry-guided transformer for 3D tooth segmentation on intraoral scans.

**Boundary:** All model-specific code stays behind `ClinicalSegmentationProvider` / `ProductionModelProvider`. React receives only segmentation results, metrics, metadata, progress stages, and errors.

## License

| Asset | Status |
|-------|--------|
| TSegFormer source (`https://github.com/huiminxiong/TSegFormer`) | **MIT** |
| Pretrained checkpoint | **Not published** as a redistributable download in upstream README; training writes `best_model.t7` locally |
| Training dataset | Private IOS corpus (paper) — **not available** in this repository |

Code MIT ≠ product clearance for unpublished weights or private patient-derived data.

## Checkpoint

`ProductionModelProvider` becomes operational only when:

1. `CAD_SEG_CHECKPOINT` points at a legally obtained `.t7` (or equivalent) file
2. `CAD_TSEGFORMER_ROOT` points at a local MIT checkout of TSegFormer
3. The isolated worker loads the checkpoint successfully

Otherwise the provider remains **unavailable** and exposes:

> Production model not configured.

It is **forbidden** to silently fall back to the reference heuristic while claiming Production ran.

## Dataset

Held-out annotated ground truth is required for BENCHMARK PASS. No challenge archives are bundled. `TeethSeg22Adapter` accepts caller-supplied decoded arrays when legally cleared.

## Input Preparation

```
Import → Normalize → Orient → Trim → Close Base → FINAL PREPARED GEOMETRY
```

Production inference verifies `geometryFingerprint` against the working mesh. Source / pre-trim / pre-base meshes are refused.

Adapter (worker):

- ClinicalMesh positions + indices
- Area-weighted face sampling (default 10 000)
- Features: XYZ + normals + curvature proxy (+ pad) → 7–8 channels per TSegFormer input contract
- Normalization: center + unit-sphere (documented)
- Mapping preserved: sample → source face / vertex

Recorded: `inputVertexCount`, `inputTriangleCount`, `sampleCount`, `normalization`, `scaleUnit`, `runtime`.

## Inference

```
Clinical Application
  → Segmentation Runtime
  → ProductionModelProvider (Model Adapter)
  → Python worker (`tools/segmentation-inference/seg_worker_http.py`)
  → TSegFormer (when configured)
```

Device: **CUDA GPU** when available, else **CPU**. Reported honestly; never silently mislabeled.

## Postprocessing

Deterministic only:

- Drop tiny islands (&lt; 3 faces)
- Project sample labels → faces (majority vote)
- Enforce one FDI per instance
- Boundary quality metrics (`boundaryLength`, `boundaryConfidence`, …)
- Flag `LOW_CONFIDENCE` when thresholds fail

Forbidden: fabricate missing teeth, arbitrary height-band labels, merge unrelated teeth.

## Tooth Instances

Each instance: `instanceId`, FDI, arch, face/vertex membership, centroid, bounds, surfaceArea, confidence, geometryFingerprint, providerId, modelVersion.

Missing teeth remain missing (`missingCandidate` / Mark Missing). No hardcoded “32 teeth” invention.

## Gingiva

Label `0`. First-class semantic region. Unassigned / non-validated tooth regions are not auto-promoted to teeth.

## FDI

Permanent: 11–18, 21–28, 31–38, 41–48. Gingiva: 0.

## Reconstruction

Presentation rebuilds from the **original final prepared mesh** with per-region materials — no cylinder/sphere fake teeth.

## Visualization

- Restrained enamel family + distinct gingiva
- Subtle surface-following boundaries (mesh edges)
- FDI sprites anchored to tooth centroids
- Tooth Numbering panel (Upper / Lower chart)
- Clinical status vocabulary (honest)

## Performance

Worker reports cold load / warm stages: preprocess, inference, postprocess, mesh projection, visual rebuild.

## Benchmark Metrics

When GT supplied: TLA, TIR, TSA, per-tooth F1, gingiva F1, macro/micro F1 via `TeethSeg22Adapter` — diagnostics only, not patient UI.

## Human Review

AUTO SEGMENTATION → REVIEW (numbering, select, Mark Missing) → Accept / Retry / Reject.

## Persistence

Accept persists face/vertex membership, FDI, instances, confidence, provider provenance, model version, geometry fingerprint. Geometry mutation → **STALE**.

## Remaining Limitations

- No product-cleared checkpoint is shipped; Production remains unavailable until configured
- TSegFormer class→FDI map is documented and overridable (`CAD_SEG_FDI_MAP_JSON`); verify against your checkpoint’s label book
- Clinically Validated is **not claimed**

## Certification

See `docs/certification/CLN-SEG-001-segmentation-reconstruction.md`.
