# PROD-002E — Production Anatomy / Arch Analysis

**Status:** READY (implementation) — browser PASS not claimed  
**Date:** 2026-09-12  
**Scope:** Geometry-driven arch anatomy for Import → Preparation → Segmentation

## Capabilities

| Cue | Source |
|-----|--------|
| Upper / lower | Declared arch role (high) or dual-arch mean-Y heuristic (low) |
| Left / right | Longest PCA axis (geometric) |
| Anterior / posterior | Mid PCA axis, RH-orthonormalized |
| Occlusal | Shortest PCA axis |
| Arch / dental regions | Binned along arch axis (not world AABB X) |
| Tooth-region candidates | Superior peaks per arch bin — geometric only |

## Guarantees

- Deterministic for identical mesh input  
- Confidence-scored (`high` / `moderate` / `low` / `unavailable`)  
- No hard-coded demo coordinates  
- No fake clinical tooth identity  
- Ambiguous geometry → `unavailable` / warnings, prep still succeeds  
- Exposed in Preparation panel (`clinical-arch-anatomy`) via auto-prep reports  

## Version

`clinical-arch-anatomy-v2`

## Automated gates

| Gate | Result |
|------|--------|
| typecheck | **PASS** |
| tests (PROD-002E + related) | **PASS** |
| build | **PASS** |
| architecture | **PASS** |
| lint (studio full) | **FAIL** — pre-existing strict typed-lint backlog (PROD-002B); anatomy path not the config blocker |
| Browser | **Not claimed** |
