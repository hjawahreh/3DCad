# Clinical Architecture

## Boundary

Clinical logic lives only under `apps/studio/src/clinical`. Generic Studio host infrastructure (`application/`, `shell/`, `hosts/`) remains non-clinical.

```
ClinicalApplication
  → StudioApplication / StudioCompositionRoot (platform composition)
  → ClinicalRuntime → ClinicalSession → ClinicalWorkspace
  → ClinicalShell (UI)
```

## Rules

- No platform package modifications
- No duplicated platform responsibilities
- No mesh/geometry algorithms in clinical bootstrap / display / trim UI / close-base UI
- Geometry algorithms live in `apps/studio/src/geometry-kernel` behind KernelBridge
- Display modes presented clinically without changing `@cad-studio/viewport`
- Single active case per clinical session
- CLN-008: Source / Working / Preview / Display mesh roles; real trim & close-base commits
