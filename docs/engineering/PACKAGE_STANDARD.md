# Package Standard

Each package or crate must contain these files before it may contain production source:

```text
README.md        purpose, owner, public API and allowed dependencies
ARCHITECTURE.md  internal design, invariants and boundary decisions
API.md           stable public contracts and compatibility policy
TESTING.md       test levels, fixtures and required commands
OWNERS.toml      accountable team and review escalation
```

Packages may expose only documented entry points. Internal folders are not imported by other packages. A package may have exactly one bounded responsibility; if its README needs unrelated purposes, split it.

`API.md` must declare a **contract stability** level: `Experimental` | `Stable` | `Frozen` (see [GOVERNANCE.md](GOVERNANCE.md)).

A COD milestone that adds or materially changes a package is incomplete until the [Implementation Readiness Checklist](IMPLEMENTATION_READINESS.md) is satisfied.
