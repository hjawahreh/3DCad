# Parameters

Immutable `ClinicalCloseBaseParameters`. Changes update preview state only.

| Parameter | Range | Default | Contract use |
|-----------|-------|---------|--------------|
| strategy | plane / surface | plane | Selects Geometry Services family.operation |
| height | 0.5–20 mm | 2 | `offset.uniform` distance |
| thickness | 0.5–10 mm | 1.5 | slab / fill thickness |
| orientation | xy / xz / yz | xy | planeNormal payload |
| margin | 0–5 mm | 0.2 | clearance payload |
| smoothing | boolean | false | payload flag (not a new kernel op) |

Height must be ≥ thickness. Out-of-range values are clamped; invalid combinations fail validation and block commit.
