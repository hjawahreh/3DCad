# Clinical Trim (CLN-008)

## Purpose

Production-grade clinical trim: draw a boundary, validate continuously, preview a **real** cut mesh, commit through Operation Runtime, and advance document revision with undo/redo.

## Lifecycle

1. Activate Trim (`ready-for-trim`)
2. Draw boundary (polyline / freehand; stylus-compatible pointer path)
3. Edit / undo point / clear / close loop
4. Validate (min points, closed, self-intersection, preparation, kernel)
5. Submit → Geometry Services `boolean.subtract` → clinical reference kernel
6. Preview = real retained exterior mesh (centroid-in-polygon classification)
7. Accept → CommitToken → document metadata update → history → scene republish (`fitCamera: false`)

## Algorithm

- Boundary stroke is projected into mesh XY via AABB (screen 640×480 → mesh bounds when coords look screen-like).
- Triangle centroids inside the polygon are **removed**; exterior is retained.
- Result is compacted, fingerprinted (`geo:…`), quality-checked, and stored as working mesh on commit.

## Validation codes

Structured clinical / kernel messages include:

- `INVALID_BOUNDARY_TOO_FEW_POINTS` / minimum-points check
- Self-intersection / closed-boundary checks in `ClinicalTrimValidation`
- Kernel validation failures surface as Operation Runtime validation errors

## History metadata

Commit retains fingerprint, kernel payload (algorithm, backend, vertex/face counts), and document snapshot for undo/redo.

## Limitations

- Crossing triangles are classified by centroid (no exact half-edge clip yet).
- Screen→mesh projection uses a fixed virtual viewport mapping.
- Native Open3D path is scaffolded, not linked.
