# Clinical Close Base (CLN-007)

Creates a closed base beneath an imported clinical model through Operation Runtime.

## Components

| Type | Role |
|------|------|
| `ClinicalCloseBaseRuntime` | Public façade |
| `ClinicalCloseBaseController` | Preview, submit, commit, history |
| `ClinicalCloseBaseSession` | Live parameter / preview state |
| `ClinicalCloseBaseOperation` | Operation Runtime wrapper |
| `ClinicalCloseBaseHandler` | `OperationHandler` for kind `close-base` |
| `ClinicalCloseBaseValidation` | Immutable validation reports |
| `ClinicalCloseBaseHistory` | Close Base undo/redo |

## Strategy → Geometry Services

| Strategy | Family | Operation |
|----------|--------|-----------|
| Plane-based | `offset` | `uniform` |
| Surface-derived | `repair` | `fill-holes` |

No new kernel capabilities. Studio adapter: `GeometryServicesKernelPort`.

## Docs

- [CLOSE-BASE-WORKFLOW.md](./CLOSE-BASE-WORKFLOW.md)
- [STRATEGIES.md](./STRATEGIES.md)
- [PARAMETERS.md](./PARAMETERS.md)
- [OPERATION-PIPELINE.md](./OPERATION-PIPELINE.md)
- [TESTING.md](./TESTING.md)
