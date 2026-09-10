# Import Workflow

```
File Selection
→ Import Runtime Validation
→ Importer Resolution
→ Import Session (+ progress / cancel)
→ ClinicalDocumentBuilder
→ ClinicalSceneBuilder / Object Registry
→ Viewport publish + camera fit
→ Selection reset
→ Case dirty
→ Completed
```

Orchestrated by `ClinicalImportCoordinator` via `ClinicalImportController`.
Phases tracked by `ClinicalImportWorkflow` and surfaced in UI notifications.
