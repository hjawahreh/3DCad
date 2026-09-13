# PROD-002H — Clinical Handoff and Persistence

**Status:** READY (implementation) — browser PASS not claimed  
**Date:** 2026-09-12  
**Scope:** Stable provider-agnostic clinical handoff for segmented cases

## Contract

**Version:** `clinical-handoff-v2`

**Intended consumers:** Trim · Close Base · Tooth Movement · Treatment Planning · Manufacturing

### Guarantees

| Concern | Behavior |
|---------|----------|
| Provider-agnostic | Geometry kernel / VTK backend ids **never** appear in handoff |
| Segmentation provenance | `arches[].segmentation.{providerId,modelId,…}` only |
| Stable tooth IDs | `inst-NNN` (+ FDI / confidence / needsReview) |
| Transforms | 16-float clinical transform per arch |
| Geometry identity | `geometryFingerprint` + `geometryRevision` (+ mesh buffers in persistence) |
| Validation | Case + segmentation verdicts; WARNING allowed for movement readiness |
| Frames / neighbors | Optional on teeth when present on document meta |
| Face membership | **Out of scope** (explicit note) — compact summary only |

### `readyForMovement`

Requires: all role-bearing arches segmented · no FAIL verdicts · orientation accepted · preparation metadata present.

## Persistence

| Operation | Behavior |
|-----------|----------|
| **Save** | Document JSON + mesh buffers + handoffJson; caches `getLastHandoff()` |
| **Close** | Drops active case; geometry cleared by open/close path |
| **Reopen** | Restores document + meshes; **rebuilds** handoff from document (authoritative) |

## Non-leaks

- No VTK imports under `clinical/handoff`
- No `geometryBackend` field on handoff types
- Seg accept no longer writes `providerId` into `geometryBackend`
- Pipeline stage inference no longer regexes backend ids

## Automated gates

| Gate | Result |
|------|--------|
| typecheck | **PASS** |
| tests (clinical + architecture, 308) | **PASS** |
| build | **PASS** |
| architecture | **PASS** (handoff scanned; no VTK import / no `geometryBackend:` field) |
| lint (studio full) | **FAIL** — pre-existing ~1840 typed-lint backlog (PROD-002B) |
| PROD-001T regression | **PASS** |
| Browser | **Not claimed** |
