# Clinical Close Base (Phase 5 — Production)

## Purpose

Transform a trimmed clinical arch into a base-supported model without damaging dental anatomy. Preview is non-destructive until Accept.

## Workflow

```
TRIM → CLOSE BASE → AUTO CLOSE BASE
```

1. Enter Close Base (shared arch context)
2. Isolate active Upper/Lower (visibility only)
3. Choose Base Style: Plane Base · Offset Base · Surface Fill
4. Set Height / Thickness / Offset
5. Preview → real proposed mesh (working/source unchanged)
6. Accept → CommitToken → Document → History → Scene
7. Stay in tool for repeated editing or the other arch
8. Or run **Auto Close Base** for clinical defaults + preview

## Architecture

```
Preview/Accept
  → ClinicalCloseBaseOperation
  → GeometryServicesKernelPort
  → Geometry Services (offset.uniform | repair.fill-holes)
  → Kernel Bridge → closeBaseMesh
  → CommitToken → Clinical Document → History → Scene (fitCamera: false)
```

Do not call KernelBridge from Close Base UI modules.

## Arch switcher

Reuses `ClinicalArchSwitcher` (same control as Trim).

## Strategies

| Style | Kernel | Behavior |
|-------|--------|----------|
| Plane Base | `closeBase.plane` | Extruded walls + flat base; original dental triangles preserved |
| Offset Base | `closeBase.offset` | Stronger thickness/inset walls; dental triangles preserved |
| Surface Fill | `closeBase.surface` | In-place hole fill (ear-clip); no tall pedestal |

Open3D scaffold remains unlinked. No GPL dependencies.

## Preview vs Accept

- **Preview** (`preview: true`): registry preview + display only; document revision unchanged
- **Accept** (`preview: false`): commit working mesh + descriptor + history; source role preserved
- Fit active arch **once** after the first successful preview (not continuously)

## Parameters (clinical)

- Base Style
- Height (mm)
- Thickness (mm)
- Offset (mm) — kernel `margin`
- Plane orientation (default `xz` for clinical Y-up / inferior base)

## Validation

Case, model, arch, preparation, parameters, strategy, kernel/operation availability, geometry quality, boundary diagnostics, commit eligibility (fingerprint).

## Persistence

Accepted working meshes persist through the existing case save/load path (`ClinicalCaseService` / IndexedDB).

## Limitations

- Undo restores document descriptors; mesh registry follows republish/display refresh
- Segmentation is out of scope for Phase 5
