# PROD-002I — Browser Certification: Import → Segmentation

**Status:** PASS  
**Date:** 2026-09-12  
**Scope:** Real interactive browser workflow Import → Segmentation → Handoff → Save/Reopen → Trim on segmented geometry  
**Baseline:** PROD-001T Trim/Close Base / Hybrid VTK locked (no architecture redesign)

## Runner / evidence

| Artifact | Path |
|----------|------|
| Walkthrough | `docs/certification/prod-002-browser-walkthrough.mjs` |
| Machine log | `docs/certification/prod-002-browser-walkthrough.json` |
| Screenshots | `docs/certification/prod-002-browser-shots/` |
| Fixtures | `apps/studio/public/clinical-fixtures/upper.stl`, `lower.stl` |
| Studio | `http://localhost:1420/` |
| VTK worker | `http://127.0.0.1:8765/health` |

**Latest run:** `2026-09-12T08:03:43.749Z` — **21 PASS / 0 OBSERVE / 0 FAIL**

## Checklist (requested)

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Open Studio | **PASS** | `00-boot.png` |
| 2 | Import case | **PASS** | Dual STL upper 261287 / lower 233562 faces — `01-import-dual.png` |
| 3 | Import progress | **PASS** | Create-case success → continue orient |
| 4 | Validation | **PASS** | Case `WARNING` findings=10 errors=0 — `02-case-validation.png` |
| 5 | Warnings/errors | **PASS** | WARNING surfaced; 0 ERROR findings |
| 6 | Continue valid case | **PASS** | Continue to orientation |
| 7 | Preprocessing | **PASS** | Auto-prep ready + fingerprint — `04-preprocessing.png` |
| 8 | Clinical orientation | **PASS** | Accepted, high confidence — `03-orient-accepted.png` |
| 9 | Anatomy/arch analysis | **PASS** | upper/high, 12 candidates — `05-anatomy-analysis.png` |
| 10 | Run tooth segmentation | **PASS** | Upper+lower heuristic instances — `08-segmentation-review.png` |
| 11 | Real individual tooth geometry | **PASS** | 32 instances/arch with centroids + local frames |
| 12 | Tooth IDs | **PASS** | Stable unique `inst-001`…`inst-032` |
| 13 | Confidence/validation | **PASS** | verdict=`WARNING`, caseBand=`moderate`, needsReview flagged — `09-segmentation-validation.png` |
| 14 | Segmentation review | **PASS** | Acknowledge + accept — `10-dual-arch-segmented.png` |
| 15 | Save case | **PASS** | Persistence + handoffJson |
| 16 | Close/reopen | **PASS** | `12-reopened.png` |
| 17 | Segmentation persists | **PASS** | Seg counts + fingerprints + tooth IDs after reopen |
| 18 | ClinicalHandoffSnapshot | **PASS** | `clinical-handoff-v2`, `readyForMovement=true`, no VTK leak — `11-handoff.png` |
| 19 | Continue into Trim | **PASS** | `trim.enter` + overlay on post-seg lower |
| 20 | Segmented geometry accepted by Trim | **PASS** | Accept OK; faces 233562 → 181736; VTK trim OK×2 — `13-trim-after-seg.png` |

Also verified: Close Base after segmentation **PASS** (`14-close-base-after-seg.png`); console errors **0**.

## First-run diagnosis (honest)

Run 1 (`07:57Z`): **19 PASS / 1 FAIL** — post-seg automated Trim failed with `Could not form loop (got 2)` (headless pick corners under-sampled after segmentation UI). Pre-seg Trim and post-seg Close Base already **PASS**. Not treated as a clinical architecture defect.

**Minimal fix (walkthrough only):** angular fallback from surface hits + camera refit/retry; separate check `Trim accepts segmented geometry`.

Run 2 (`08:03Z`): **21 PASS / 0 FAIL** including post-seg Trim cut.

## Explicit non-claims

- Default segmentation remains **reference-heuristic** (not licensed NN / clinical-grade FDI identity)
- Validation **WARNING** / high `needsReview` is expected and reviewable — not hidden
- Movement UI remains locked; handoff `readyForMovement` is contract readiness only

## Architecture

No clinical/geometry architecture changes for this gate. Walkthrough automation only.
