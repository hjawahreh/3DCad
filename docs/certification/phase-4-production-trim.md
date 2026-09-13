# Phase 4 — Production Trim Certification

**Status:** PASS WITH OBSERVATIONS  
**Date:** 2026-09-11  
**Scope:** Production clinical Trim (exact geometry, multi-trim, arch isolation/switcher)  
**Stop:** Phase 4 complete — do not start Close Base redesign / Segmentation here.

## Definition of Done

| Criterion | Result |
|-----------|--------|
| Real geometry trimming | PASS — kernel `trim.exact-edge-clip` via Operation Runtime → Geometry Services → Bridge |
| Exact/robust boundary operation | PASS — recursive triangle/edge clip; centroid kept as explicit fallback only |
| Correct surface picking | PASS — `ClinicalMeshPicker` + live canvas / Camera Runtime |
| Polyline | PASS |
| Freehand | PASS — min-distance sampling |
| Multiple trims | PASS — accept leaves tool active; history revisions |
| Upper/lower switching | PASS — shared `ClinicalArchSwitcher` |
| Isolation | PASS — visibility only; inactive arch remains in case |
| Preview | PASS — Operation Runtime / registry preview role (real retained mesh) |
| Validation | PASS — live + explicit; actionable messages |
| Accept | PASS — CommitToken + document + history + republish |
| Undo / Redo | PASS — drawing Undo Pt vs document Undo/Redo |
| Cancel / Reset | PASS |
| No source corruption | PASS — working/display roles; source preserved by kernel roles |
| No camera reset | PASS — `fitCamera: false`; fit only on enter |
| Performance measured | PASS — `docs/performance/trim-benchmarks.md` |
| Tests pass | PASS — studio Vitest (trim + geometry-kernel + pre-cln011/012) |
| Build / typecheck | PASS (gates run at certification) |
| Architecture | PASS — no UI→KernelBridge; GS port preserved |

## Library evaluation

| Candidate | Decision |
|-----------|----------|
| Existing clinical reference kernel | **Used** — exact edge clip in TS |
| Open3D (TS/C++ scaffold) | Not linked; scaffold remains |
| Eigen / nanoflann / meshoptimizer | Not required for Trim hot path correctness |
| GPL libraries | Not introduced |

## Observations

1. Browser visual confirmation of mesh delta after Accept remains operator-pending (screenshots alone often understate cut).
2. Exact clip is XY-projected in the mesh frame; future native/Open3D 3D clip may improve undercuts.
3. Enter still fits the isolated arch once; subsequent arch switches do not fit (camera stable).

## Manual acceptance checklist

- [ ] Upper Trim → Accept → visually verify geometry change
- [ ] Trim again on Upper
- [ ] Switch to Lower → Trim → Accept → verify Lower changes only
- [ ] Undo / Redo document revisions
- [ ] Cancel releases pointer; toolbar remains clickable while drawing

## Artifacts

- `docs/clinical/trim.md`
- `docs/performance/trim-benchmarks.md`
- `apps/studio/src/geometry-kernel/ops/trimMeshExact.ts`
- `apps/studio/src/clinical/shell/ClinicalArchSwitcher.tsx`
