# Case Model

Immutable `ClinicalDocumentSnapshot` owns:

- Case + patient metadata
- Revision, units (`mm`), coordinate system (`rhs-y-up`)
- Display settings (grid/origin/axes)
- Dirty flag

No mesh payloads.

## Operations

- New Case / Open Case (placeholder) / Close Case
- Dirty / Save (clears dirty; persistence I/O is host-owned)
- Recent Cases registry (`localStorage` index only)
