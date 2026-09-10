# Clinical Preparation (CLN-005)

Production preparation environment that orchestrates tools **before** any geometry operation.

## Components

| Type | Role |
|------|------|
| `ClinicalPreparationRuntime` | Public façade |
| `ClinicalPreparationSession` | Live workflow state |
| `ClinicalPreparationWorkflow` | Phase machine |
| `ClinicalPreparationController` | Start / validate / orchestrate / complete |
| `ClinicalPreparationManager` | Context + stage advancement |
| `ClinicalPreparationValidator` | Immutable validation reports |
| `ClinicalPreparationPipeline` | Tool orchestration registry |
| `ClinicalPreparationLifecycle` | Session lifecycle |
| Diagnostics / Metrics | Sessions, stages, validation, duration |

## Docs

- [PREPARATION-WORKFLOW.md](./PREPARATION-WORKFLOW.md)
- [VALIDATION.md](./VALIDATION.md)
- [PIPELINE.md](./PIPELINE.md)
- [TESTING.md](./TESTING.md)

## Forbidden

Trim geometry, close base, segmentation, movement, mesh modification, kernel operations, manufacturing execution.
