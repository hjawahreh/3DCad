# Segmentation Architecture

See also:

- `docs/architecture/CLN-SEG-001-production-segmentation.md` — production model path
- `docs/architecture/segmentation-model-decision.md` — provider decision
- `docs/architecture/model-licensing.md` — license gate
- `docs/clinical/segmentation.md` and `docs/architecture/model-providers.md`

Reuses CLN-008 geometry kernel (`MeshRegistry`, quality pipeline, spatial index) for mesh access. Does not create a second KD-tree subsystem.

**CLN-SEG-001:** Production inference runs in an isolated Python worker. The reference heuristic is **REFERENCE / Development** only and must never be labeled Production.