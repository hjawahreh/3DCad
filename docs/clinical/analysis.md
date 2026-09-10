# Clinical Analysis (CLN-010)

Observational analysis layer between segmentation and future biomechanics.

## Pipeline position

```
Import → Orient → Prepare → Trim → Close Base → Segment → Identify → Review → Analysis
```

## Architecture

```
Clinical Analysis Runtime
  → Analysis Registry / Providers
  → Measurement Engine + Tooth / Arch / Spacing / Crowding / Collision / Occlusion
  → Validation (VALID | WARNING | INCOMPLETE | INVALID)
  → Cache (revision + algorithm version keyed)
  → Overlay / Toolbar (presentation)
```

Analysis is **read-only by default**. It does not mutate source or working meshes.

Saved results store **metadata only** in the analysis session — not geometry buffers.

## Decision support

All results are decision-support. They are not diagnosis, guaranteed accuracy, or treatment recommendations.

## Commands

- `clinical.tool.analysis` / `clinical.analysis.measure`
- `clinical.analysis.angle` / `clinical.analysis.tooth`
- `clinical.analysis.arch` / `clinical.analysis.spacing` / `clinical.analysis.crowding`
- `clinical.analysis.occlusion` / `clinical.analysis.clear` / `clinical.analysis.save`

## Related docs

- [measurements.md](./measurements.md)
- [tooth-coordinate-systems.md](./tooth-coordinate-systems.md)
- [arch-analysis.md](./arch-analysis.md)
- [occlusion-analysis.md](./occlusion-analysis.md)
- [../architecture/clinical-analysis.md](../architecture/clinical-analysis.md)
