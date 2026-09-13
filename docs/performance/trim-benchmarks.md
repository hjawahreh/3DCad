# Trim performance benchmarks (Phase 4)

Measured on the clinical reference backend (`trim.exact-edge-clip`) inside `@cad-studio/studio` Vitest / Node. Figures are indicative; re-run after geometry changes.

## Method

Synthetic grid meshes from `geometry-kernel` test helpers; closed rectangular / triangular boundaries in live viewport coordinates (640×480). Timings use `performance.now()`.

## Results (representative)

From `geometry-benchmarks` smoke (CLN-008 harness, exact trim default), Node Vitest:

| Size | Vertices | Triangles | Trim median | Close-base median | Notes |
|------|----------|-----------|-------------|-------------------|-------|
| small | 81 | 128 | ~27 ms | ~19 ms | Exact edge clip |
| medium | 625 | 1152 | ~49 ms | ~8 ms | Exact edge clip |
| large | 2401 | 4608 | ~98 ms | ~78 ms | Exact edge clip |

Additional stage budgets:

| Stage | Typical | Notes |
|-------|---------|-------|
| Boundary processing (validate + stroke) | &lt; 1 ms | ≤32 pts |
| Geometry commit + descriptor | &lt; 5 ms | CommitToken path |
| Pointer-to-preview (overlay) | frame-bound | SVG overlay; no sync kernel on move |

## Memory

- Working mesh replace on accept; previous snapshot retained in `ClinicalTrimHistory` (bounded undo stack).
- Preview role meshes released when Operation Runtime session disposes.
- No global pointer capture; overlay capture released on pointerup / cancel / accept / tool change / unmount.

## UI responsiveness

- Drawing path never awaits the kernel.
- Accept/submit is async; toolbar remains interactive for Cancel.
- Arch switch clears the in-progress boundary without blocking.

## Re-run

```bash
pnpm --filter @cad-studio/studio test -- geometry-kernel.test.ts trim.test.ts
```

Optional micro-bench (dev):

```bash
node --import tsx -e "
import { createMesh, fingerprintMesh } from './apps/studio/src/geometry-kernel/mesh/TriangleMesh.ts';
import { trimMesh } from './apps/studio/src/geometry-kernel/ops/trimMesh.ts';
// construct mesh + boundary; loop trimMesh; print ms
"
```

## Observations

- Exact edge clip is slower than centroid classification on straddling-heavy boundaries but removes the CLN-008 “kept straddler” artifact.
- Prefer surface picks (`meshX`/`meshY`) to avoid screen→AABB projection cost variance across viewport sizes.
