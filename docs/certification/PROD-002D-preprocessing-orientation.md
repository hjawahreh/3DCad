# PROD-002D — Preprocessing and Orientation Production Flow

**Status:** READY FOR BROWSER CERTIFICATION (not claimed PASS)  
**Date:** 2026-09-12  
**Baseline:** PROD-001T (locked Trim/Close Base + loop3d), PROD-002 / PROD-002C  
**Scope:** Studio UI Import → Validation → Preprocessing → Clinical Orientation

## Production flow (honored)

1. Import + structured validation (PROD-002C)  
2. Continue to Orientation  
3. Auto-orient establishes clinical frame (+Y superior, +Z anterior)  
4. Accept Orientation → persist `orientationMeta` + object transforms  
5. Auto-preparation runs (diagnostics/caches; source mesh immutable)  
6. Ready for Trim with PROD-001T local/world loop3d unchanged

## Critical locks

| Lock | Status |
|------|--------|
| PROD-001T loop3d prefers local over divergent world | **Preserved** (regression test) |
| No AABB camera axes when clinical orientation available | **Fixed** (`shouldPreferClinicalFrame` / `resolveAnteriorAxes`) |
| No Trim / Close Base redesign | **Honored** |
| Source geometry immutable during prep/preprocess | **Covered by tests** |

## Code fixes in this gate

- Prefer clinical frame when `orientationMeta.acceptedAt` or non-identity transforms exist  
- Fit All after orientation re-applies clinical anterior pose  
- SceneBuilder fit is opt-in; uses oriented bounds when fitting  
- Workflow + preparation validator trust persisted `orientationMeta`  
- Prep panel surfaces auto UI status + orientation accepted note  
- Orient Accept notifies preparation success/warning toasts  
- Transform helpers: translate / scale / point transform / world↔local

## Automated gates

| Gate | Result |
|------|--------|
| typecheck | **PASS** |
| tests (`prod-002d-orientation-prep` + clinical + architecture) | **PASS** |
| build | **PASS** |
| architecture | **PASS** |
| Browser | **Not claimed** |

## Browser certification (when ready)

Reuse create-case → Continue to Orientation → Accept → prepare status from PROD-002 / PROD-002C runners. Assert:

- `clinical-orientation-toolbar` visible after continue  
- After Accept: `orientationMeta.acceptedAt` set  
- `clinical-preparation-auto-ui` Ready / Ready with warnings  
- Anterior camera uses clinical +Y/+Z (not AABB) when oriented  

## Verdict

**PROD-002D implementation: READY**  
**Browser PASS: NOT CLAIMED** without interactive evidence.
