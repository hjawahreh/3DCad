# Close Base performance benchmarks (Phase 5)

Indicative Node / Vitest timings from the clinical reference backend (`closeBase.plane` / `.offset` / `.surface`).

## Method

Synthetic grid meshes from `geometry-kernel` helpers; plane/offset/surface strategies. Timings via `performance.now()` inside geometry-benchmarks + close-base tests.

## Results (representative)

From CLN-008 geometry-benchmarks smoke (close-base median column):

| Size | Vertices | Triangles | Close-base median | Notes |
|------|----------|-----------|-------------------|-------|
| small | 81 | 128 | ~19 ms | Plane strategy |
| medium | 625 | 1152 | ~8–20 ms | Plane strategy |
| large | 2401 | 4608 | ~78 ms | Plane strategy |

Stage budgets:

| Stage | Typical | Notes |
|-------|---------|-------|
| Preview (kernel, `preview: true`) | same order as above | Display updated; working untouched |
| Accept / commit | + descriptor & history &lt; 5 ms | CommitToken path |
| Memory | working + preview transient | Preview cleared on cancel/accept |

## UI

- Preview/accept are async; Cancel remains available
- Fit once after first preview — not on every parameter tweak
- Arch switch does not refit

## Re-run

```bash
pnpm --filter @cad-studio/studio test -- geometry-benchmarks.test.ts close-base.test.ts
```
