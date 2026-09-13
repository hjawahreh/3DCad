# PROD-002S Segmentation Integrity

## Root Causes

1. **Face membership not persisted** — accept wrote compact tooth summaries only; `faceIndices` lived in the live session prediction and were discarded on accept/save.
2. **No geometry binding enforcement** — `geometryFingerprint` / `sourceRevision` were stored but never compared to working geometry after Trim / Close Base.
3. **Silent retention after geometry edits** — `applyClinicalGeometryCommitToDescriptor` updated mesh counts/fingerprints while leaving `segmentationMeta` marked as accepted.
4. **Optimistic `readyForMovement`** — handoff treated “has segmentationMeta + not FAIL” as Movement-ready, allowing WARNING + `reference-heuristic` through.
5. **UI “Valid / Ready / Complete”** — inspector and preparation labels did not reflect integrity status or honest Movement readiness.

## Face Membership Contract

Representation: `face-membership-v1`

```text
segmentationMeta.faceMembership = {
  version: 'face-membership-v1',
  meshFaceCount,
  instances: [{ instanceId, faceIndices[] }],  // mesh-local face indices
  membershipFingerprint                       // integrity hash (not a backend id)
}
```

- Indices are **mesh-local face indices** on the geometry revision at accept.
- Not VTK cell ids, renderer ids, or GPU ids.
- Bound to `segmentationMeta.geometryFingerprint` + `sourceRevision`.
- Survives Save → Reopen; historical membership is retained when status becomes STALE.

## Geometry Revision Contract

- On accept: `status = CURRENT`, `acceptedAt`, fingerprint/revision copied from prediction.
- Currency invariant: segmentation is CURRENT only when  
  `meta.geometryFingerprint === object.geometryFingerprint`  
  and  
  `meta.sourceRevision === object.geometryRevision`  
  and face membership integrity holds.
- Mismatch ⇒ STALE (evaluated even if status was left CURRENT).

## Invalidation Rules

| Event | Effect |
| --- | --- |
| Trim commit | Target arch `segmentationMeta.status = STALE` (reason: Trim); provenance + face membership retained |
| Close Base commit | Same with Close Base reason |
| Fingerprint/revision mismatch | Evaluated STALE |
| Missing membership | Evaluated INVALID |

Upper mutation does not invalidate lower (and vice versa). BOTH keeps independent per-arch integrity.

## Readiness Contract

`readyForMovement` is derived, never optimistic. Requires all of:

- segmentation CURRENT per required arch
- face membership present and integral
- validation verdict **PASS** (WARNING ≠ PASS)
- provider is **not** non-clinical (`reference-heuristic` / heuristic / scaffold / mock)
- orientation accepted + preparation metadata present
- no case validation FAIL

Current product truth: with Reference Heuristic, **`readyForMovement = false`** always.

## Validation Semantics

| Verdict | Meaning | Accept | Movement |
| --- | --- | --- | --- |
| PASS | Mandatory structural checks satisfied | Allowed | Eligible only if other readiness rules pass |
| WARNING | Non-blocking review issues / heuristic limits | Allowed after review ack | **Not** Movement-ready |
| FAIL | Blocking structural failure | **Blocked** | Not Movement-ready |

Accept additionally requires non-empty face membership on the live prediction.

## Persistence

- Accept writes `faceMembership`, `status`, `acceptedAt`, verdict, provenance into `segmentationMeta`.
- IndexedDB document JSON carries membership (compact indices, not vertex buffers).
- Handoff v2 exposes integrity fields per arch; `readyForMovement` uses the honest readiness evaluator.
- After geometry mutation, STALE status + membership round-trip through save/reopen.

## Browser Evidence

Script: `docs/certification/prod-002s-segmentation-integrity-browser.mjs`  
JSON: `docs/certification/prod-002s-segmentation-integrity-browser.json`  
Shots: `docs/certification/prod-002s-browser-shots/`

Walkthrough result: **11 PASS / 0 FAIL**

Flow proven:

Import → Auto Orientation → Prepare → Segment (both arches) → Accept → Save → Reopen (membership CURRENT, readiness false) → Trim upper → upper STALE / lower CURRENT → Save → Reopen → stale preserved, `readyForMovement = false` → Movement not started.

## Automated Tests

| Suite | Result |
| --- | --- |
| `prod-002s-segmentation-integrity.test.ts` (A–M) | PASS |
| Related handoff / pipeline / phase-9 updates | PASS |
| Studio vitest | **353 passed** |
| typecheck | PASS |
| build | PASS |
| architecture tests | PASS |
| lint (repo) | Pre-existing debt unchanged; gate files reviewed |

## Remaining Observations

- Reference Heuristic remains explicitly non-clinical; Movement must wait for a future clinically validated provider with PASS verdict.
- Face membership JSON for large dental meshes is sizable but reconstructable; not vertex buffers.
- Preparation internal stage may still be named `ready-for-movement` after CURRENT accept; UI labels now say **Not Ready for Movement** until the clinical readiness contract is satisfied.
- This gate does **not** certify clinical anatomical segmentation quality.

## Certification

PASS
