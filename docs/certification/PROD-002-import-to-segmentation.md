# PROD-002 — Import → Segmentation Production Pipeline

**Final status:** PASS WITH OBSERVATIONS  
**Date:** 2026-09-12  
**Baseline:** PROD-001T interactive browser **PASS** (locked; Trim / Close Base / Hybrid VTK not rebuilt)  
**Scope:** End-to-end clinical preparation pipeline through certified geometry:

```text
IMPORT → VALIDATION → PREPROCESSING → ORIENTATION → ANATOMY/ARCH ANALYSIS
  → TOOTH SEGMENTATION → SEGMENTATION VALIDATION → CLINICAL HANDOFF
  → TRIM → CLOSE BASE
```

**This is an engineering / pipeline certification.** It is **not** a claim of clinical accuracy, regulatory clearance, or “AI segmentation.” Default tooth segmentation is **reference-heuristic**.

---

## Final verdict

**PASS WITH OBSERVATIONS**

The pipeline is proven by automated gates and a fresh interactive browser walkthrough on real fixtures. PROD-001T Trim / Close Base behavior remains intact on segmented cases. Remaining observations are listed below; **none are treated as blockers** for this milestone’s engineering exit, but they **must** remain visible before any clinical-accuracy or Movement milestone.

---

## Exact evidence supporting the PASS portion

### Fresh final browser walkthrough (required)

| Item | Value |
|------|--------|
| Runner | `docs/certification/prod-002-browser-walkthrough.mjs` |
| Machine log | `docs/certification/prod-002-final-browser-walkthrough.json` |
| Screenshots | `docs/certification/prod-002-final-browser-shots/` (18 PNGs) |
| Fixtures | `apps/studio/public/clinical-fixtures/upper.stl`, `lower.stl` |
| Studio | `http://localhost:1420/` |
| VTK worker | `http://127.0.0.1:8765` (`cad-vtk-worker`) |
| Run timestamp | `2026-09-12T08:31:29.162Z` |
| Result | **28 PASS / 0 OBSERVE / 0 FAIL** |

Pipeline checks exercised in that run (all **PASS**):

| Stage | Evidence excerpt |
|-------|------------------|
| Import | Upper 261287 / lower 233562 faces |
| Case validation | `WARNING`, findings=10, errors=0 |
| Orientation | Accepted, `high`, `clinical-auto-orient-v1` |
| Preprocessing | Ready, fingerprint present, warnings=6 |
| Anatomy/arch | Upper region/high, frame moderate, 12 candidates |
| Pre-seg Trim | VTK OK; 261287 → 245027 |
| Pre-seg Close Base | `direction_source clinical:xz`; 245027 → 254293 |
| Tooth segmentation | `reference-heuristic`; 32 instances/arch |
| Seg validation | `WARNING`; needsReview flagged (upper 19 / lower 32) |
| Handoff | `clinical-handoff-v2`; consumers include `trim`, `close-base`; no VTK leak |
| Post-seg Trim preview | Overlay + `Points: 5 · Closed: yes · Valid` |
| Post-seg Trim commit | 233562 → 181736; VTK trim OK×2 |
| PROD-001T loop / locals | Worker `loop` len=4, `operation_version=PROD-001T`, `loopNearLocal=true`, 31 local picks |
| Trim undo / redo | Fingerprints restore / re-apply |
| Orientation preserved | Same `acceptedAt` through undo/redo |
| Post-seg Close Base | 254293 → 263559; all close_base `clinical:xz` |
| Save / reopen | Seg counts + fingerprints + handoff v2 persist |
| Console | 0 serious errors |

Prior gate evidence retained: PROD-002I (`prod-002-browser-walkthrough.json`, 21/21) and PROD-002J (`prod-002j-browser-walkthrough.json`, 28/28).

### Automated quality gate (fresh final run)

| Gate | Result | Evidence |
|------|--------|----------|
| `pnpm typecheck` (apps/studio) | **PASS** | exit 0 |
| Unit / integration / geometry / clinical tests | **PASS** | `vitest run test/clinical` → **34 files / 310 tests** |
| Architecture tests | **PASS** | included above (`architecture.test.ts`: no VTK in trim/close-base/handoff; no `geometryBackend:` in handoff) |
| Geometry / PROD-001 regression suite | **PASS** | includes `prod-001t-vtk-integration`, `prod-001r`, `prod-001s`, hardening fixtures |
| PROD-002 contract tests | **PASS** | `prod-002-pipeline`, `prod-002c`…`prod-002j`, handoff, anatomy, validation, etc. |
| `pnpm build` (apps/studio) | **PASS** | Vite production build exit 0 |
| Interactive browser walkthrough | **PASS** | 28/28 final run above |
| `pnpm lint` (apps/studio) | **FAIL** | See Observation 1 |

### Sub-gate documentation (implementation trail)

| Gate | Doc |
|------|-----|
| Import UI | `PROD-002C-import-ui.md` |
| Preprocess / orientation | `PROD-002D-preprocessing-orientation.md` |
| Anatomy / arch | `PROD-002E-anatomy-arch.md` |
| Segmentation hardening | `PROD-002F-segmentation-hardening.md` |
| Segmentation validation | `PROD-002G-segmentation-validation.md` |
| Handoff / persistence | `PROD-002H-clinical-handoff-persistence.md` |
| Browser Import → Seg | `PROD-002I-browser-import-segmentation.md` |
| Seg → Trim → Close Base | `PROD-002J-seg-trim-close-integration.md` |

### Domain / architecture review (summary)

- **Intact:** Hybrid VTK → Kernel Bridge → Trim / Close Base Operation Runtime path; no redesign.
- **Handoff:** `clinical-handoff-v2` provider-agnostic; fingerprint identity; **no** geometryBackend / VTK worker ids in contract.
- **Validation:** Segmentation accept **blocked on FAIL**; WARNING accept requires review acknowledgment path.
- **Determinism:** Preprocess clone immutability + loop3d local preference covered by tests.
- **Geometry correctness (engineering):** Post-seg Trim/Close Base change fingerprints/faces via VTK HTTP; mesh-local loop matches PROD-001T regression.
- **Persistence:** Save → close → reopen restores seg meta, tooth IDs, fingerprints, handoff.

---

## Remaining observations (complete list)

1. **Studio full lint fails** — `pnpm lint` reports **1849 errors / 2 warnings** across ~324 files (dominant: `@typescript-eslint/no-non-null-assertion`, `no-unnecessary-type-assertion`). Pre-existing typed-lint backlog (PROD-002B). **Does not** invalidate typecheck, tests, build, or browser evidence for this pipeline. Still a **quality-gate observation** until cleaned.

2. **Default segmentation is reference-heuristic, not licensed NN inference** — Provider id `reference-heuristic`. Instance counts are capped; validation commonly returns **WARNING** with high `needsReview`. **Do not** call this “AI.” **Do not** treat FDI identity / tooth boundaries as clinically accurate.

3. **Not clinically certified** — Evidence certifies **engineering pipeline readiness** (import through Trim/Close Base on segmented cases). It does **not** constitute clinical validation, diagnostic claim, or regulatory certification.

4. **Binary PLY unsupported** — ASCII PLY only; binary PLY requires a real reader (not stubbed).

5. **Performance** — Full-arch heuristic segmentation on ~250k-face fixtures takes on the order of **minutes** in headless Chromium (final walkthrough wall ~6 minutes end-to-end). Acceptable for this milestone; not a production latency SLA claim.

6. **Analysis / Movement / Biomechanics / Treatment remain workflow-locked** — Intentional. Handoff `readyForMovement=true` is a **contract readiness** flag only; Movement UI stays locked.

7. **ONNX / research NN adapters remain non-operational scaffolds** — Must not be presented as shipping clinical models.

8. **Case / seg validation WARNING is expected on representative fixtures** — Case validation `WARNING` (findings>0, errors=0) and seg `WARNING` are surfaced honestly, not hidden to force a green clinical story.

9. **First PROD-002I post-seg Trim automation failure** — Historical `Could not form loop` was a **headless pick sampling** issue fixed in the walkthrough only; not a kernel redesign. Final and PROD-002J runs pass Trim without that failure.

---

## Explicit non-goals (honored)

- No Orientation 2.0 redesign  
- No bundling unlicensed NN weights / fake AI branding  
- No unlocking Tooth Movement UI  
- No replacing VTK hybrid Trim / Close Base  
- No fabricated clinical accuracy claims  
- No weakened tests  

---

## Architecture locks (honored)

- Geometry Kernel / Clinical Engine / Manufacturing / Enterprise Runtime untouched as platforms  
- `HybridGeometryBackend` / `VtkHttpWorkerBackend` / VTK HTTP worker / Kernel Bridge preserved  
- Existing Trim + Close Base runtimes and PROD-001T evidence preserved  
- Tool → Operation Runtime → Geometry Services → Kernel Bridge → CommitToken preserved  

---

## Blocker assessment

**No BLOCKED status.** There is no functional or architectural blocker preventing exit from PROD-002 engineering certification.

Next major clinical milestones (e.g. Movement, licensed models, clinical accuracy studies) **must not** proceed under a false assumption that heuristic segmentation or this document equals clinical certification. Observation 1 (lint backlog) should be tracked as engineering hygiene, not as clinical readiness.

---

## How to reproduce final evidence

```bash
# Studio :1420 + VTK worker :8765 must be running
cd apps/studio && pnpm typecheck && pnpm exec vitest run test/clinical test/architecture.test.ts && pnpm build
# lint is expected FAIL until backlog cleared — record counts, do not weaken rules

CERT_SHOTS_DIR=prod-002-final-browser-shots \
CERT_REPORT_JSON=prod-002-final-browser-walkthrough.json \
NODE_PATH=/path/to/playwright/node_modules \
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
  node docs/certification/prod-002-browser-walkthrough.mjs
```
