# GEO-001 clinical geometry fixtures

Real dental STLs used by GEO-001 / GEO-001A / GEO-001B:

- `apps/studio/public/clinical-fixtures/upper.stl`
- `apps/studio/public/clinical-fixtures/lower.stl`

**GEO-001B:** import registers SOURCE as raw soup and WORKING via
`normalizeMeshTopology()` (exact weld). Do not certify topology on raw soup
alone.

Evidence:

- `docs/certification/geo-001b-evidence/normalization.json`
- `docs/architecture/GEO-001B-import-topology-normalization.md`
