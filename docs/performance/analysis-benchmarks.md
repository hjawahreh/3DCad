# Analysis Benchmarks (CLN-010)

Smoke harness: `apps/studio/src/clinical/analysis/benchmark/AnalysisBenchmark.ts`

Captured in `test/clinical/analysis/analysis.test.ts` (machine-dependent, not CI-gated).

Representative local run (2026-09-10):

| Workload | p50 (ms) | p95 (ms) |
|----------|----------|----------|
| point-distance | ~0.02 | ~0.16 |
| arch-10-teeth | ~0.04 | ~0.21 |
| arch-20-teeth | ~0.06 | ~0.11 |
| crowding-20 | ~0.08 | ~0.45 |
| collision-query | ~3.5 | ~21 |

Memory: not instrumented beyond existing process heap; collision uses existing spatial index.
