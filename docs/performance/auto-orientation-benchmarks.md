# Auto Orientation Benchmarks

**Algorithm:** `clinical-auto-orient-v1`  
**Date:** 2026-09-11

## Measured stages (conceptual)

| Stage | Notes |
|-------|--------|
| Preprocess / sample | Stride sample ≤ ~6000 points/arch |
| PCA | Power-iteration covariance (first-party) |
| Axis signing | Dual-arch + variance gradient |
| Mat4 build | O(1) |
| Scene preview publish | Existing ClinicalSceneBuilder |
| Camera fit + anterior | Existing Camera Runtime |

## Expectations

- Typical dual-arch clinical scans: estimation should feel interactive (< ~100–200 ms on desktop for sampled points; dominated by mesh size before sampling).  
- No fake progress percentages — status messages only.  
- React UI is not blocked by continuous per-frame re-estimation.

## How to re-measure

Run Vitest suite `auto-orientation.test.ts` for correctness.  
For timing, wrap `estimateClinicalOrientation` around fixture STLs in a local script; record median over ≥20 runs.

## Observations

Large fixture STLs still parse on the main thread at import (Phase 1). Orientation estimation samples down aggressively and does not re-parse files.
