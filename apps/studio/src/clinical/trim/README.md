# Clinical Trim Tool (CLN-006)

First geometry-editing clinical tool. Interactive boundary drawing with Operation Runtime commit.

## Components

| Type | Role |
|------|------|
| `ClinicalTrimRuntime` | Public façade |
| `ClinicalTrimController` | Drawing, preview, submit, commit |
| `ClinicalTrimSession` | Live boundary state |
| `ClinicalTrimOperation` | Operation Runtime wrapper |
| `ClinicalTrimHandler` | `OperationHandler` for kind `trim` |
| `GeometryServicesKernelPort` | KernelPort → Geometry Services → Kernel Bridge |
| `ClinicalTrimValidation` | Boundary validation reports |
| `ClinicalTrimHistory` | Trim undo/redo |

## Docs

- [TRIM-WORKFLOW.md](./TRIM-WORKFLOW.md)
- [BOUNDARY.md](./BOUNDARY.md)
- [OPERATION-PIPELINE.md](./OPERATION-PIPELINE.md)
- [TESTING.md](./TESTING.md)

## Forbidden

Direct kernel access, document mutation during preview, bypassing Operation Runtime.
