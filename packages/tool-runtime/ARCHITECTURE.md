# Operation Runtime Architecture

```text
OperationHost
├── OperationRegistry
├── OperationExecutor (+ RetryPolicy)
├── ValidationPipeline + ResultValidator
├── ProgressManager
├── CancellationManager
├── CommitCoordinator → CommitGate
├── WorkflowGate
├── OperationDiagnostics
└── OperationMetrics
        ↓
   OperationSession (FSM)
        ↓
   CommandIntent (Application → Domain)
```

## Pipeline

```text
Preconditions → Kernel (retry) → Geometry validation → Result validation
  → ready-to-commit → CommitCoordinator → token + CommandIntent
```

## Constitutional invariants

1. No kernel / validation success ⇒ no commit token.  
2. WorkflowGate requires a live token.  
3. Failures/cancels produce no document command.  
4. Domain never called from this package.  
