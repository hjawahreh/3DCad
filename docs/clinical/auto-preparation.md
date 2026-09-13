# Clinical Auto Preparation

**Algorithm version:** `clinical-auto-prep-v1`  
**Module:** `apps/studio/src/clinical/preparation/ClinicalAutoPreparationRunner.ts`

## Purpose

After Auto Orientation, automatically run **safe, deterministic** preparation so the case is explicitly **Ready for Trim**.

## What it does

Per available arch (Upper / Lower / both):

1. Mesh validation (finite coordinates, indices, emptiness)
2. Topology / degenerate / boundary / component diagnostics
3. Derived **normals** (cache only — source mesh unchanged)
4. **Bounds** cache
5. **Spatial index** cache
6. Clinical readiness → workflow `ready-for-geometry` / stage `ready-for-trim`

## What it does not do

- Smooth, remesh, decimate, or fill holes on authoritative geometry
- Delete valid disconnected anatomy
- Mutate source MeshRegistry topology

Diagnostics vs safe prep are distinguished: warnings do not block Trim; hard failures do.

## UI states

`not-started` → `analyzing` → `preparing` → `ready` | `warning` | `failed`

## Idempotency

Same geometry fingerprint → no duplicate sessions/revisions/caches.

## Persistence

Compact `preparationMeta` on the clinical document (no mesh buffers).
