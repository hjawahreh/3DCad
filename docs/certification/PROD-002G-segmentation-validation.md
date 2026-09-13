# PROD-002G — Segmentation Validation

**Status:** READY (implementation) — browser PASS not claimed  
**Date:** 2026-09-12  
**Scope:** Production PASS / WARNING / FAIL gate before segmentation accept

## Verdict contract

| Verdict | Meaning | Accept |
|---------|---------|--------|
| **PASS** | No fatal or review-required issues | Allowed |
| **WARNING** | Reviewable limitations (missing slots, heuristic neighbors, fragments, confidence) | Allowed after review acknowledgement when `needsReviewCount > 0` |
| **FAIL** | Clinically unsafe (overlap, duplicates, invalid geometry, mixed arch, broken neighbors, …) | **Blocked** |

Version: `clinical-seg-validation-v2`

## Checks

| Category | Check id(s) | Typical severity |
|----------|-------------|------------------|
| Tooth count | `tooth-count*`, `instance-cap` | FAIL if empty; WARNING if capped/high |
| Missing teeth | `missing-slots` | WARNING |
| Merged teeth | `merged-teeth` | WARNING (span proxy) |
| Duplicate assignments | `fdi-unique`, `stable-ids` | FAIL |
| Overlap | `overlap` | FAIL |
| Invalid geometry | `empty-instances`, `finite-geometry`, `face-index-bounds` | FAIL |
| Boundary quality | `boundary-quality` | WARNING |
| Topology | `topology-face-list` | FAIL |
| Disconnected fragments | `disconnected-fragments` | WARNING |
| Tooth IDs | `stable-ids` | FAIL if duplicate |
| Anatomical position | `anatomical-position` | WARNING (FDI vs X-order) |
| Confidence | `confidence` | WARNING |
| Neighbors | `neighbors` | FAIL if dangling IDs; else WARNING |
| Arch consistency | `arch-consistency`, `fdi-arch-bank` | FAIL |

## Accept / review flow

- Accept **always revalidates** the live prediction with `archRole` + `meshFaceCount` (no stale cache alone).
- Review edits (relabel / merge / split / mark missing / semantic) refresh validation and clear acknowledgement.
- Toolbar disables Accept when `validationReport.verdict === 'FAIL'`.
- WARNING remains reviewable via **Acknowledge Review Required**.

## Future manual edits (domain only — no fake UI)

`SEGMENTATION_MANUAL_EDIT_CAPABILITIES`: split, merge, reassign, boundary-correction, mark-missing.  
APIs: `splitInstance`, `mergeInstances`, `relabelInstanceFdi`, `markSemanticFaces`, `markInstanceMissing`.

## Automated gates

| Gate | Result |
|------|--------|
| typecheck | **PASS** |
| clinical + architecture tests | **PASS** (305) |
| PROD-002G suite | **PASS** (7) |
| build | **PASS** |
| architecture | **PASS** |
| lint (studio full) | **FAIL** — pre-existing ~1840 typed-lint backlog (PROD-002B) |
| PROD-001T regression | **PASS** |
| Browser | **Not claimed** |
