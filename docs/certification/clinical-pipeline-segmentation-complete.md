# Clinical Pipeline — Import → Segmentation Complete

**Status:** Certified (Phase 9)  
**Scope end:** Import → Orientation → Preparation → Trim → Close Base → Segmentation → Review → Accept  
**Out of scope:** Clinical Analysis changes, Tooth Movement, Biomechanics, Treatment Planning

---

## Full pipeline

```
CREATE CASE
  → IMPORT (Upper / Lower)
  → OPEN CASE
  → AUTO ORIENT → Accept
  → AUTO PREPARE
  → TRIM UPPER → Accept
  → TRIM LOWER → Accept
  → CLOSE BASE UPPER / LOWER
  → AUTO CLOSE BASE
  → AUTO SEGMENT
  → REVIEW TEETH
  → ACCEPT SEGMENTATION
  → SAVE / REOPEN (resume)
```

No stage requires developer knowledge or fake progress. Source geometry is never silently replaced.

---

## Architecture compliance

| Rule | Status |
|------|--------|
| Geometry Kernel via compose APIs | ✓ |
| Operation Runtime → Geometry Services → Kernel Bridge → CommitToken | ✓ |
| Segmentation provider abstraction model-independent | ✓ |
| Clinical document stores compact metadata only | ✓ |
| No PyTorch in React / no Python clinical dependency | ✓ |
| Shared arch switcher / viewport / toolbars | ✓ |
| Failures leave last accepted state recoverable | ✓ |

---

## Model / provider status

| Provider | Operational | Notes |
|----------|-------------|-------|
| `reference-heuristic` | **Yes (default)** | Production geometry inference |
| `onnx-runtime` | No | Scaffold; weights not bundled |
| TSegFormer / MeshSegNet / TGNet / DentalMAE | No | License/runtime gated |

Decision: `docs/architecture/segmentation-model-decision.md`  
Licensing: `docs/architecture/model-licensing.md`

---

## Test matrix

| Test | Coverage |
|------|----------|
| `phase-9-pipeline.test.ts` | Single-arch E2E accept + workflow ✓; dual-arch both arches; review gate; save/reopen resume |
| `auto-segmentation.test.ts` | Phase 8 presentation + accept |
| `segmentation/segmentation.test.ts` | Provider / review / architecture |
| `case-persistence.test.ts` | Case save/open meshes |
| Phases 1–8 suites | Orient / prep / trim / base / segment |

---

## Manual browser verification

Use real Upper + Lower fixtures (`apps/studio/public/clinical-fixtures/` when available):

1. Create patient / case  
2. Import Upper + Lower  
3. Open case  
4. Auto Orient → Accept  
5. Auto Prepare  
6. Trim Upper → Accept; Trim Lower → Accept  
7. Close Base / Auto Close Base per arch  
8. Segment Teeth → processing screen → review  
9. Verify FDI / gingiva / teeth display  
10. Acknowledge review if required → Accept  
11. Repeat for other arch if pending  
12. Confirm **Segmentation Complete** banner (real counts)  
13. Save → Close → Reopen → verify `segmentationMeta` + workflow Segment ✓  

---

## Performance

`createPipelineTimingCollector()` records case-load / orientation / segmentation durations in E2E smoke. **No arbitrary CI timing thresholds.**

---

## Known limitations

- Production NN weights are not bundled; default inference is first-party geometry heuristic.  
- Trim/Close Base geometry ops in automated E2E are stage-advanced where full mesh surgery is optional; browser cert covers real ops.  
- Analysis / Movement / Biomechanics / Treatment remain locked by design.  
- Camera reset on case open uses clinical anterior presenter (intentional resume framing).

---

## Acceptance criteria

- [x] Pipeline stages connect without developer intervention  
- [x] Upper/Lower shared interaction model  
- [x] Workflow bar: Import → … → Segment ✓ after case completion  
- [x] Review required gate (no silent accept of uncertain teeth)  
- [x] Accept stores compact metadata + history; reject leaves source untouched  
- [x] Case resume restores preparation stage + segmentation metadata  
- [x] Real completion counts (no fabrication)  
- [x] Tests + build + architecture  

**STOP HERE.** Import → Segmentation product objective is complete.
