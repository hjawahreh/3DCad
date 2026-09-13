# GEO-001E

Clinical Trim V2 — real region commit + performance.

This milestone proves that a real dental Trim mutates working geometry, that
preview and accept share one clip result, and that Close Base consumes the
post-trim fingerprint. It does **not** claim clinical certification.
Movement was not started.

## Real Case

| Field | Value |
| --- | --- |
| Fixture | `apps/studio/public/clinical-fixtures/upper.stl` |
| Case | `GEO-001E-Clinical-Trim-V2` |
| initialFingerprint | `geo:c828c055` |
| initialTriangleCount | 261287 |
| initialVertexCount | 131779 |
| initialBoundaryLoops | ≥1 (open clinical rim after normalize) |

## Trim Input

Peripheral surface loop (not a full-arch convex hull). Anchors collected from
mesh picks on the active upper working mesh, closed via SurfacePath, thinned
to ≤128 samples for VTK.

Walkthrough Trim A:

| Metric | Before | After Accept |
| --- | --- | --- |
| fingerprint | `geo:c828c055` | `geo:9d186916` |
| triangles | 261287 | 255851 |
| vertices | 131779 | 129337 |

Removed ≈5436 triangles on the enclosed labial patch.

## SurfacePath

- Controller builds an authoritative closed SurfacePath before kernel.
- After Close, densified samples carry `faceId`s; subsequent preview rebuild
  uses `reconstruct:'never'` when ≥12 face-tagged samples (no second full
  geodesic).
- Kernel bridge validates `loop3d` with `reconstruct:'never'` (does not
  re-pay Dijkstra). Validation is retained.
- Thinning gate records max deviation; silent commit of a materially altered
  thinned path is rejected.

## Region Selection

Clinical keep mode remains **REMOVE selected interior** (`KEEP_OUTSIDE`).

Kernel diagnostics explicitly report:

- `selectedRegion=remove-interior`
- `keepRegion=exterior`
- `removedRegion=interior`
- `meta:selectedRegionTriangles` / `meta:keepRegionTriangles` /
  `meta:removedRegionTriangles`
- `meta:inputFingerprint` / `meta:outputFingerprint`

Identity fingerprint or `removedTriangles <= 0` is a hard validation failure
(no silent NO_OP).

## Geometry Delta

Browser Trim A:

- `outputFingerprint != inputFingerprint` ✓
- triangle count decreased ✓
- Trim B further mutated to `geo:020c212a` (244253 faces) ✓

Unit / engine:

- Reference interior loop mutates fingerprint and reports
  `selectedRegion` / `removedRegion` triangle counts.
- Far-outside loop fails as `NO_REGION` / no geometry change.

## Preview

- `preview: true` writes **preview/display only**; working mesh is restored
  from the pre-kernel snapshot on cancel.
- Preview uses fast `analyzeMesh` gating (not full Accept validation).
- Browser Trim A `previewFingerprint` = `geo:9d186916`.

## Commit

Accept promotes the exact preview mesh → working (no second VTK clip), then
runs full `backend.validate` on that mesh.

Require:

`previewFingerprint == committedFingerprint`

Browser: `geo:9d186916` == `geo:9d186916` ✓

Accept rejects if working fingerprint is unchanged vs pre-kernel mesh.

## Undo / Redo

| Step | Fingerprint |
| --- | --- |
| After Trim A | `geo:9d186916` |
| Undo | `geo:c828c055` (restored) |
| Redo | `geo:9d186916` (matches Trim A commit) |

## Save / Reopen

After Trim B (`geo:020c212a`): Save → Reopen restored the same fingerprint and
face count (244253).

## Performance Breakdown

Measured on the same 261k-triangle upper mesh.

### Browser (Playwright walkthrough)

| Stage | Duration |
| --- | --- |
| Trim A preview (end-to-end UI → VTK → preview ready) | **49584 ms** |
| Trim B preview | **49316 ms** |
| Close Base preview wait (wall) | **244431 ms** (wait helper; see observations) |

Prior GEO-001D full-arch hull Trim preview was ≈**101 s** and Accept was a
NO_OP. GEO-001E peripheral real region Accept mutates geometry; wall preview
latency roughly **halved** vs that failure mode.

### Offline stage profile (Vitest, normalized upper)

| Stage | ms (representative) |
| --- | --- |
| Topology cold / warm | ~750–1900 / ~0 (cache hit) |
| Spatial index | ~625–1100 |
| Quality pipeline | ~525–1300 |
| analyzeMesh | ~460–1130 |
| SurfacePath (tiny 4-seed probe) | ~5–9 s |
| VTK SelectPolyData+clip (Python, peripheral loop) | ~2–3 s total (`select_polydata` ~110 ms, `clip` ~80 ms, convert_out ~300–480 ms) |
| Worker JSON payload | ≈6.3 MB positions+indices b64 |

### Identified bottleneck

Dominant remaining cost for interactive Trim preview on real dental density is
**not** VTK SelectPolyData itself (~0.1–0.2 s select + clip). Measured
limiting contributors:

1. **Browser → VTK HTTP transfer + encode/decode** of the full working mesh
   (~6 MB JSON) each preview.
2. **SurfacePath geodesic** when building from sparse polyline anchors
   (Close still densifies with reconstruct; expensive on long spans).
3. **Repeated mesh analysis / quality / spatial** work around the kernel
   (mitigated by fingerprint topology/spatial caches and preview vs accept
   validation split).

Optimizations applied in this milestone (measurement-backed):

- Skip bridge SurfacePath geodesic re-build (`reconstruct:'never'`).
- Topology/spatial GeometryCache by fingerprint.
- Preview vs Accept validation split.
- VTK encode cache by mesh fingerprint; safer base64 chunk encode.
- Reject identity / zero-removed as validation failure (no false NO_OP).
- Preview mesh promote on Accept (single clip).

## Cache Reuse

| Cache | Key | Behavior |
| --- | --- | --- |
| TopologyGraph | mesh fingerprint | hit on unchanged working mesh |
| GeometryCache topology/spatial | objectId+revision+fingerprint | bridge records `meta:topologyCache=hit` |
| VTK encode cache | mesh fingerprint | skip re-b64 on preview retry |

Invalidate after geometry mutation / commit.

## Base Handoff

After Trim B:

| Field | Value |
| --- | --- |
| trimmedFingerprint | `geo:020c212a` |
| baseInputFingerprint | `geo:020c212a` |
| match | **true** |

Close Base therefore consumes the **post-trim** working mesh, not the
pre-trim open rim. Close Base construction was **not** redesigned in
GEO-001E.

## Automated Tests

| Suite | Result |
| --- | --- |
| `geo-001e-trim-performance.test.ts` | PASS (9) |
| `trim.test.ts` | PASS (18) |
| typecheck | PASS |

Coverage includes: real-region mutation (reference), outside NO_REGION,
thinning bound, topology/spatial cache reuse, preview==commit promote,
sequential trim fingerprints, real upper baseline counts.

## Browser Evidence

Script: `docs/certification/geo-001e-browser-walkthrough.mjs`  
Shots: `docs/certification/geo-001e-browser-shots/`

| Shot | Content |
| --- | --- |
| 01-before-trim.png | Pre-trim upper, 261.3k tris |
| 02-surface-loop.png | Closed peripheral loop on tooth |
| 03-trim-preview.png | Preview ready |
| 04-after-accept.png | Accepted, 255.9k tris |
| 05-after-undo.png | Restored original |
| 06-after-redo.png | Restored Trim A |
| 07-second-trim.png | Second mutation |
| 08-reopened.png | Persist |
| 09-base-input.png | Post-trim input to Base |
| 10-base-preview.png | Base preview capture |

JSON: `docs/certification/geo-001e-browser-walkthrough.json`

Latest walkthrough summary: **11 PASS / 0 FAIL / 1 OBSERVE**
(base handoff fingerprint matched; Close Base preview readiness wait observed).

## Remaining Observations

1. **Preview latency still high (~49–50 s)** for a localized real dental
   Trim despite ~2–3 s VTK core clip. Bottleneck is measured as transfer +
   SurfacePath densify + surrounding analysis — not “progress UI”.
2. **Close Base preview wait** remains slow in the walkthrough helper even
   when `baseInputFingerprint == trimmedFingerprint` (handoff proven;
   recorded as OBSERVE).
3. Walkthrough diagnostic SurfacePath probe (gaps reconstruct) may report
   self-intersection while the controller Close/Preview path succeeds;
   authoritative path is the controller/kernel path.
4. Interactive target (sub-second / few-second preview) is **not** met yet
   for 261k meshes over HTTP VTK without further transfer/architecture work
   (e.g. worker-resident mesh by fingerprint, binary frames).

## Certification

**PASS WITH OBSERVATIONS**

Criteria check:

1. Real dental Trim mutates geometry — **PASS**
2. Removed region corresponds to user loop (localized patch; face count +
   fingerprint change; shots 02–04) — **PASS**
3. Preview is real — **PASS**
4. Accept commits exactly preview — **PASS**
5. Second Trim uses current geometry — **PASS**
6. Undo/redo restore actual geometry — **PASS**
7. Save/reopen preserves result — **PASS**
8. Bottleneck identified and measured — **PASS** (still slow)
9. Base receives post-trim mesh fingerprint — **PASS**
10. No false NO_OP on enclosed real region — **PASS**

Not clinical certification. Do not start Movement.
