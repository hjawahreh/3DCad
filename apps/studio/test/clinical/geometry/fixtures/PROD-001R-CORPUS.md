# PROD-001R geometry failure / regression corpus

Non-PHI fixtures and cases used to gate geometry backends.

## Real dental scans

| File | Role |
|---|---|
| `apps/studio/public/clinical-fixtures/upper.stl` | Large open upper arch |
| `apps/studio/public/clinical-fixtures/lower.stl` | Large open lower arch |

## Automated cases (`prod-001r-backend.test.ts`)

| Case | Expectation |
|---|---|
| Trim no-change (far boundary) | Reject — `Trim produced no geometry change` |
| Exact trim on open upper (decimated) | Fingerprint + face count change; finite coords |
| Close Base on open lower | `addedTriangles` > 0 and ≤ cap; finite |
| Upper trim → close-base | Caps + finite |
| Centroid / unbounded AABB prototypes | Disabled via `GeometryBackendPolicy` |
| Manifold / VTK / Open3D scaffolds | Throw `UNSUPPORTED_OPERATION` in-browser |

## Observed production failure classes (manual / PROD-001)

- Trim no visible cut despite VALID/ACCEPT
- Malformed / giant Close Base
- Frozen Close Base (dense ear-clip)
- Open / non-manifold / STL-duplicated vertex meshes
- Self-intersecting deferred on full ~250k tris

Do not add patient-identifying information to this corpus.
