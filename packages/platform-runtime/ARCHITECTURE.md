# Platform Runtime Architecture

```text
RuntimeBuilder → ServiceContainer → ApplicationRuntime
                                      ├─ LifecycleCoordinator
                                      ├─ CommandBus / QueryBus / EventBus
                                      ├─ ImmutableStateStore
                                      ├─ TaskScheduler
                                      ├─ EcsWorld
                                      ├─ DiagnosticsRegistry
                                      └─ PluginRegistry
```

The composition root is `RuntimeBuilder`. It binds explicit service descriptors, validates the dependency graph, and creates a child scope for a runtime session. Services receive dependencies only through factory arguments. The container is not globally reachable and is not passed into business handlers.

Commands are validated and authorized before middleware and handler execution. Successful commands may atomically publish a state transition, history registration, and events through injected ports. Queries are read-only and cache only declared cacheable results. Events are immutable envelopes ordered by priority within their stream; replay is bounded and diagnostic.

The scheduler is deterministic in admission order for equal priority and exposes cancellation, dependencies, timeout, retry, progress, and terminal state. It does not create platform threads; worker execution is injected by a host adapter. ECS is a transient generic data store with stable entity identities, typed component keys, archetype signatures, and query snapshots.
