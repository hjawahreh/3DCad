# Clinical Geometry Foundation (CLN-008)

Orchestration layer for clinical geometry — **no mesh kernels** in this folder.

Algorithms live in `apps/studio/src/geometry-kernel/`. This module owns roles, errors, metrics, cache policy, operation metadata, and document deltas (counts / fingerprints only).

## Pipeline

```
Clinical Tool
  → Clinical Geometry Operation
  → Operation Runtime
  → Geometry Services
  → Kernel Bridge
  → ClinicalGeometryKernelBridge (studio geometry-kernel)
```

React and clinical UI never run booleans, remesh, spatial indexes, or buffer algorithms.

## Contents

| File | Role |
|------|------|
| `MeshRoles.ts` | Source / Working / Preview / Display revision refs |
| `ClinicalGeometryErrors.ts` | Structured error categories |
| `ClinicalGeometryMetrics.ts` | Timing and mesh-size metrics |
| `ClinicalGeometryCachePolicy.ts` | Revision / fingerprint invalidation |
| `ClinicalGeometryOperationMeta.ts` | History / reproducibility metadata |
| `ClinicalGeometryDocumentDelta.ts` | Descriptor patches without buffers |
