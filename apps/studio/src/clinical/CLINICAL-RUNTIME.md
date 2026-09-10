# Clinical Runtime

## Components

| Type | Role |
|------|------|
| `ClinicalRuntime` | Creates/owns clinical session |
| `ClinicalSession` | Case lifecycle, tools, events |
| `ClinicalLifecycle` | Deterministic phases |
| `ClinicalEvents` | Pub/sub |
| `ClinicalMetrics` / `ClinicalDiagnostics` | Observability |
| `ClinicalContext` | Read-only composition for UI/tools |
| `ClinicalToolRegistry` | Tool registration only |

## Lifecycle

`created → bootstrapping → ready → case-active ↔ case-dirty → closing → ready → disposed`
