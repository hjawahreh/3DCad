# Fixture note — synthetic only

Deterministic synthetic meshes are generated at runtime via
`buildSyntheticDentalSurface` in the geometry kernel (no proprietary patient data).

Sizes used in tests/benchmarks:

| Name | gridResolution | approx triangles |
|------|----------------|------------------|
| small | 8 | 128 |
| medium | 24 | 1152 |
| large | 48 | 4608 |
| pathological | noisy boundaries in fuzz tests | variable |
