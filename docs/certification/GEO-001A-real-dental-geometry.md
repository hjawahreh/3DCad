# GEO-001A Real Dental Geometry Certification

**Verdict: FAIL**

Evidence gate for `ClinicalGeometryEngine` on real clinical fixtures
(`upper.stl` / `lower.stl`). Movement was not started. Clinical certification
is **not** claimed.

No engine redesign was applied after the failure (per §26). The failure below
is the input for the next focused geometry-engine implementation.

---

## Real Cases

| Case | Source | Role |
|---|---|---|
| Upper arch | `apps/studio/public/clinical-fixtures/upper.stl` | Real permitted dental scan |
| Lower arch | `apps/studio/public/clinical-fixtures/lower.stl` | Real permitted dental scan |
| Dual case | Browser: `GEO-001A-Real-Dental-Geometry-Upper-Lower` | Real upper + lower |
| Prior production lineage | Same fixtures as PROD-001T / PROD-002R-B | Continuity with prior Studio path |

Synthetic meshes were **not** used as primary certification evidence (unit grids
remain supplementary only).

Artifacts:

- `docs/certification/geo-001a-browser-walkthrough.mjs`
- `docs/certification/geo-001a-browser-walkthrough.json`
- `docs/certification/geo-001a-browser-shots/`
- `docs/certification/geo-001a-evidence/mesh-baselines.json`
- `apps/studio/test/clinical/geometry/geo-001a-real-dental-baseline.test.ts`

---

## Mesh Baselines

Recorded offline (`geo-001a-real-dental-baseline.test.ts`) and confirmed in
browser via `kernel.geometryEngine.analyzeMesh` after Import → Auto Orientation.

| Metric | UPPER | LOWER |
|---|---:|---:|
| Geometry fingerprint | `geo:052a19f9…` | `geo:4f0579c1…` |
| Vertex count | 783 861 | 700 686 |
| Triangle count | 261 287 | 233 562 |
| Surface area (mm²) | ~3981 | (see baselines JSON) |
| Connected components | **261 287** | **233 562** |
| Boundary edge count | **783 861** | **700 686** |
| Non-manifold edges | 0 | 0 |
| Degenerate triangles | 0 | 0 |
| Watertight | false | false |
| Manifold (index heuristic) | true | true |
| Gate | WARNING | WARNING |

### Critical baseline observation — UNWELDED_STL_TOPOLOGY

Binary STL import stores **unique vertices per triangle**
(`vertexCount = 3 × triangleCount`).

`TopologyGraph` / `MeshQualityReport` use **index adjacency**, so on these
fixtures:

- every triangle is its own connected component
- every edge is a boundary edge
- `extractBoundaryLoops` returns **one 3-vertex loop per triangle**
  (~261 287 loops on upper)
- ranked “primary” boundary is a **single triangle**
  (~1.83 mm perimeter, ~0.05 mm² projected area) — **not** the dental open border

This is not a synthetic artifact. It is the authoritative MeshRegistry working
geometry for the real Studio import path.

---

## Trim

### Surface Path

UI polyline on real upper anterior region: **5–6 mesh-picked points**, closed,
UI validation reported **Boundary valid** (`04-trim-loop.png`,
`05-trim-preview.png`).

`ClinicalGeometryEngine` SurfacePath association (GEO-001 gate in
`ClinicalTrimController.preview`) returned:

> **Trim boundary crosses disconnected scan surfaces.**

Representative SurfacePath samples were on-surface (`nearestHit=true`,
distance≈0) but each sample had a **distinct `componentId` equal to its
`faceId`** — consistent with one-component-per-triangle topology.

| Check | Result |
|---|---|
| Distance to source surface | PASS (on-surface) |
| Face association | Present |
| Mesh fingerprint | `geo:052a19f9` (not stale) |
| Target arch | Upper |
| Component continuity | **FAIL** |
| Off-surface / screen-space-only loop | Not the failure mode |

### Preview

Studio Preview invoked the GEO-001 SurfacePath gate before the kernel.

| Check | Result |
|---|---|
| Preview ready | **false** |
| Removed triangles | none (no kernel success metrics) |
| Duration waited | ~74 s before hard fail on Accept path |
| Visual cut correspondence | **Not produced** |

Do **not** accept based on UI “Valid” alone — the engine path rejected the same
loop.

### Accepted Geometry

**Not produced.** Accept failed with the same SurfacePath message.
Fingerprint / revision of working upper geometry remained at the import
baseline for the trim attempt.

### Metrics

| Metric | Value |
|---|---|
| Input triangle count | 261 287 |
| Output triangle count | n/a (no commit) |
| Removed triangle count | 0 |
| Surface area before | ~3981 mm² |
| Surface area after | unchanged |
| Boundary / components before→after | unchanged |
| Input fingerprint | `geo:052a19f9` |
| Output fingerprint | n/a |

Multi-op Trim A→B→C, outside-loop, and invalid-loop browser legs were **not
reached** after the SurfacePath hard fail (script aborted on Accept).

### Visual Result

Human visual gate on the drawn loop:

- Loop sits on real anterior anatomy (`04-trim-loop.png`) — UI intent is clear.
- **No engine preview cut** appears (`05-trim-preview.png` still shows full
  uncut arch with loop overlay only).
- Therefore: intended region **not** removed by ClinicalGeometryEngine.

**TRIM: FAIL (real dental, Studio path)**

---

## Close Base

### Boundary

Not reached after successful Trim (workflow blocked).

On the **current real imported / oriented mesh** (pre-trim), engine boundary
extraction already fails the §15 contract:

| Requirement | Observed |
|---|---|
| Belongs to intended arch open border | **NO** — primary is one triangle |
| Continuous dental border | **NO** — 261 287 trivial loops |
| Not an AABB perimeter | N/A / irrelevant — primary is a face loop |
| Boundary length / area / point count | ~1.83 mm / ~0.05 mm² / **3** points |

### Base Construction / Topology / Metrics / Visual Result

**Not executed** in this certification run. No Auto Create Base screenshots
`07–11` were produced because Trim never committed.

Per §25: REAL-DENTAL PASS requires **both** Trim **and** Close Base.
Trim failure alone forces overall FAIL. Close Base remains **unproven** on
real dental through the GEO-001 path.

### Temporary implementation limit (GEO-001 carry-forward)

GEO-001 still notes: reference close-base uses capped ear-clip/walls internally.
That limit was **not** newly visually re-judged here (Trim blocked first).
It remains an open risk for the next pass — **do not hide it**.

**CLOSE BASE: FAIL / BLOCKED (no real-dental PASS evidence)**

---

## Undo / Redo

Not reached (no successful Trim commit).

---

## Persistence

Not reached (save/reopen after Trim+Base not executed).

---

## Performance

Real-mesh offline timings (`mesh-baselines.json`):

| Stage | UPPER (261 287 tri) | LOWER (233 562 tri) |
|---|---:|---:|
| Analysis | ~3.1 s | ~2.7 s |
| Topology build | ~3.4 s | ~2.3 s |
| Spatial index | ~19.2 s | ~16.2 s |

Browser:

| Stage | Notes |
|---|---|
| Import dual STL | Recorded in walkthrough JSON `evidence.performance.importMs` |
| Trim preview attempt | ~74 s then SurfacePath failure (no successful clip) |
| Base construction | Not run |

No synthetic benchmark is used as the final performance result.

---

## Browser Evidence

Walkthrough: `docs/certification/geo-001a-browser-walkthrough.mjs`

Machine JSON: `docs/certification/geo-001a-browser-walkthrough.json`

| Shot | Status |
|---|---|
| `01-imported.png` | Captured |
| `02-oriented.png` | Captured |
| `03-trim-before.png` | Captured |
| `04-trim-loop.png` | Captured |
| `05-trim-preview.png` | Captured (no geometric cut) |
| `06-trim-accepted.png` | **Missing** (Accept failed) |
| `07–11` base views | **Missing** (Trim blocked) |
| `99-error.png` | Captured |

Browser step summary: **6 PASS / 3 FAIL** (`mandatoryFail=true`).

---

## Automated Tests

| Suite | Result | Counts |
|---|---|---|
| `tsc --noEmit` / `pnpm typecheck` (studio) | PASS | — |
| `pnpm build` (studio) | PASS | Vite build ok |
| `test/architecture.test.ts` | PASS | 4/4 |
| `test/clinical/geometry/` (batch) | PASS* | 56/56 tests (*1 vitest worker `onTaskUpdate` timeout noise) |
| `geo-001-clinical-geometry-engine.test.ts` | PASS | 12/12 |
| `geo-001a-real-dental-baseline.test.ts` | PASS | 2/2 |
| `geometry-kernel.test.ts` | PASS | 11/11 |
| `close-base.test.ts` | PASS | 23/23 |
| `trim.test.ts` | PASS | 19/19 |
| Related clinical+geometry batch | PASS | 70/70 |
| Playwright certification walkthrough | **FAIL** | GEO-001A browser evidence gate |

Unit/engine suites still pass on **synthetic / planar / welded-class** meshes.
They do **not** override the real-dental Studio failure.

### Lint

| Scope | Problems |
|---|---:|
| Full `apps/studio` lint | **2278** (2276 errors, 2 warnings) — pre-existing debt, not hidden |
| GEO-001 engine + GEO-001A tests only | **270** errors (mostly `@typescript-eslint/no-non-null-assertion`) |

No lint cleanup was performed in this evidence pass.

---

## Failures

1. **REAL DENTAL TRIM BLOCKED (primary)**  
   Unwelded clinical STL topology ⇒ one component per triangle ⇒
   `validateSurfacePath` / `createSurfacePath` reject real multi-face loops with
   `Trim boundary crosses disconnected scan surfaces.`  
   Studio Preview/Accept cannot produce ClinicalGeometryEngine trim results on
   the authoritative fixtures.

2. **BOUNDARY EXTRACTION INVALID ON REAL IMPORTS**  
   Primary loop is a single triangle, not the arch open border. Close Base
   §15 gate cannot pass on this geometry even before ear-clip construction.

3. **INCOMPLETE BROWSER EVIDENCE CHAIN**  
   Required screenshots 06–11 not produced because Trim never accepted.

4. **CLOSE BASE VISUAL / EAR-CLIP GATE NOT REACHED**  
   Cannot claim pass or a new visual fail for capped ear-clip/walls on this run;
   Trim failure already fails GEO-001A.

---

## Remaining Observations

- GEO-001 reference close-base still uses capped ear-clip/walls internally
  (carry-forward; still must be judged on real dental once Trim is fixed).
- Older PROD-001R/S VTK fixture tests that bypass the GEO-001 SurfacePath
  controller gate still pass — that does **not** certify the GEO-001 Studio
  engine path.
- UI Trim validation can report “Boundary valid” while the engine SurfacePath
  gate fails — operators must not trust UI-only success.
- Next focused work (suggested input only; **not implemented here**):
  position-weld / topology rebuild for clinical imports **or** SurfacePath /
  component logic that does not treat unwelded STL faces as disconnected
  solids — without cosmetic post-processing of failed bases.

---

## Certification

| Level | Status |
|---|---|
| ENGINE PASS | **CONDITIONAL** — unit APIs / synthetic suites pass; real Studio path does not |
| REAL-DENTAL PASS | **FAIL** |
| BROWSER PASS | **FAIL** |
| CLINICAL CERTIFICATION | **NOT CLAIMED** |

### Rule (§25)

REAL-DENTAL PASS requires **Trim AND Close Base**.  
Trim failed on real dental scans through ClinicalGeometryEngine.  
Close Base was not proven.

### Overall

# FAIL

Movement remains **BLOCKED**.
