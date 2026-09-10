# Clinical Geometry Benchmarks (CLN-008)

Benchmarks are **smoke measurements**, not CI timing gates.

## Harness

```bash
pnpm --filter @cad-studio/studio test -- test/clinical/geometry/geometry-benchmarks.test.ts
```

Synthetic meshes from `buildSyntheticDentalSurface` (no patient data):

| Size | gridResolution | ~triangles |
|------|----------------|------------|
| small | 8 | 128 |
| medium | 24 | 1152 |
| large | 48 | 4608 |

## Metrics captured

- preprocessing (quality pipeline)
- spatial index build
- trim preview/cut
- close-base generation
- display mesh prep
- median / p95 (per size)
- peak memory estimate (buffer bytes)

## Notes

Absolute milliseconds vary by machine. Regressions should compare fingerprints and structural counts first; use timings only in controlled environments.

### Sample run (2026-09-10)

| Size | Vertices | Triangles | Preprocess p50 | Spatial p50 | Trim p50 | Close Base p50 | Display p50 |
|------|----------|-----------|----------------|-------------|----------|----------------|-------------|
| small | 81 | 128 | 2.3 ms | 0.7 ms | 2.2 ms | 7.1 ms | 0.9 ms |
| medium | 625 | 1152 | 12.5 ms | 5.1 ms | 6.7 ms | 10.0 ms | 3.6 ms |
| large | 2401 | 4608 | 12.1 ms | 8.2 ms | 15.8 ms | 24.9 ms | 16.5 ms |
