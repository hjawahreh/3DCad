# API

## OperationHost

Exposes `start`, `registerHandler`, `workflowGate`, `commitGate`, `operationRegistry`, `validationPipeline`, `operationMetrics`, `operationDiagnostics`, `supportedKinds`.

## Subsystems

| Module | Role |
| ------ | ---- |
| `OperationRegistry` | Kind + handler registration |
| `OperationExecutor` | Kernel execution + retry |
| `ValidationPipeline` | precondition / geometry / result steps |
| `ResultValidator` | Fingerprint / kernel presence |
| `ProgressManager` | Per-op progress |
| `CancellationManager` | Abort tracking |
| `RetryPolicy` | Configurable retries (default: 1 attempt) |
| `CommitCoordinator` | Token issue only when validated |
| `WorkflowGate` | Step advance requires token |
| `OperationDiagnostics` / `OperationMetrics` | Observability |

## Compatibility

`0.x` semver. **Stability: Experimental** (pre-PC-001). Phase and commit-token contracts are public. Breaking changes need an ADR; after PC-001 certified surfaces move toward **Frozen**.
