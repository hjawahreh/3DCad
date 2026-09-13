# Geometry Backend Decision (PROD-001R)

**Decision date:** 2026-09-11  
**Decision class:** **B — HYBRID** (no single library clears all production gates)

## Verdict

```text
Geometry backend selection unresolved as a single authoritative winner.
```

Blockers preventing **A — PRODUCTION BACKEND SELECTED** for one library:

1. **Open dental scans are not manifold solids** → Manifold returns `Error.NotManifold` / empty after vertex merge (correct refuse; no silent repair).
2. **Clinical Trim is polygon-boundary exact clip**, not only plane clip → VTK/Open3D plane clip wins on plane cuts but is not yet mapped to the clinical stroke contract in-browser.
3. **Close Base industrial hole/base generation** → Open3D `fill_holes` doubled triangles and stayed non-watertight; VTK fill is modest but not a clinical pedestal strategy; Manifold inapplicable until closed.
4. **Browser runtime** → VTK/Open3D are native/Python today; Studio UI must not block on million-face work. WASM Manifold cannot ingest open scans.

## Hybrid arrangement (evidence-based)

| Role | Backend | Production enabled in Studio |
|---|---|---|
| Authoritative browser Trim / Close Base (interim) | `clinical-reference-v1` exact-edge-clip + capped close-base | **Yes** |
| Specialized plane clipping (worker/native target) | VTK `vtkClipPolyData` **or** Open3D tensor `clip_plane` (parity on fixtures) | **No** (scaffold only) |
| Validation / quality inspection | Open3D topology checks | **No** (offline harness) |
| Solid Boolean / TrimByPlane (future closed solids) | Manifold 3.5.3 WASM | **No** (adapter present; refuses open meshes) |
| Display optimization | meshoptimizer | **No** (display-only when enabled) |

Documented in code: `apps/studio/src/geometry-kernel/adapters/GeometryBackendPolicy.ts`.

## Why this is not “Manifold wins”

Manifold is the strongest **solid** engine evaluated (control TrimByPlane + Boolean PASS). It **fails** the production selection rule on real dental Trim because inputs are open surfaces.

## Why this is not “Open3D wins”

Open3D is strong for validation and tensor plane clipping, but:

- Booleans reject open scans
- `fill_holes` failed Close Base quality gates
- No in-browser production binding

## Why this is not “VTK wins” alone

VTK plane clip is the best measured open-mesh **plane** cutting backend (~180–225 ms, real cell cuts matching Open3D tensor deltas). It still lacks:

- Wired native/worker Kernel Bridge adapter
- Proven polygon-boundary cutter for clinical strokes
- Approved Close Base strategy

## Prototype algorithms (disabled as authoritative)

| Algorithm | Status |
|---|---|
| `trim.centroid-polygon` | Prototype / test-only — not default |
| AABB shortest-axis as *cut geometry* | Inference for projection/extrude axes only — not a substitute for clipping |
| Unbounded AABB extrusion / ear-clip | Replaced by PROD-001 caps; unbounded path must not return |

## PROD-002 recommendation

**Do not start PROD-002** until one of:

1. Native/WASM worker hosts VTK or Open3D tensor clipping behind Kernel Bridge **and** polygon Trim parity is certified on upper/lower, **or**
2. Browser manual Trim/Close Base checklist for `clinical-reference-v1` is fully signed with visual proof, and Close Base industrial backend is chosen.

Preferred next engineering spike: **VTK clip worker** for plane ops + polygon extrusion cutter, with Open3D validation side-car, Manifold reserved for post-closure solids.
