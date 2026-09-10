# ADR-0002: Geometry Services, Kernel Session, and platform boundary refinements

- Status: accepted
- Date: 2026-07-26
- Owners: architecture / platform
- Decision scope: Permanent `geometry-services` package; Kernel Session; Interaction Runtime and Constraint Runtime reservations; Task Planner vs Execution Scheduler split; architectural laws; COD-005+ roadmap

## Context

ADR-0001 established Operation Runtime as the commit gate. The constitution still treated “Geometry Service” as a conceptual hop between Operation Runtime and Kernel Bridge. Without a real package, geometric policy (algorithm selection, batching, result shaping, kernel abstraction) risks leaking into Operation Runtime or Domain.

Commercial CAD also benefits from session-scoped kernel resources, separated task planning vs execution, normalized interaction input, and a reserved constraint solver for future orthodontic rules.

## Decision

1. **`packages/geometry-services`** is a permanent platform package. Operation Runtime orchestrates; Geometry Services owns geometric policy and kernel request translation.
2. Introduce **Kernel Session**: session-scoped resource/topology caches across operations within a bounded lifetime.
3. Split scheduling conceptually into **Task Planner → Task Graph → Execution Scheduler → Worker Pools**.
4. Reserve **Interaction Runtime** (normalized pointer/keyboard/touch/gesture/hit-test events) separate from Tool/Operation Runtime.
5. Reserve **Constraint Runtime** (rules, dependencies, solver, validation) without implementation.
6. Add memorisable **Architectural Laws** (Law 1–10) to the constitution.
7. Adopt the COD-005…COD-013 platform roadmap order (Geometry Services before Scene).

## Consequences

**Positive:** Clearer boundaries; Operation Runtime stays orchestration-only; future kernel optimizations have a session home.  
**Cost:** One more package and constitutional surface; Kernel Bridge remains later (COD-006).

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Keep Geometry Service conceptual only | Policy leaks into Operation Runtime |
| Domain calls Geometry Services | Violates ADR-0001 / Domain never calls kernel path |
| Merge Interaction into Tool Runtime | Couples device I/O to CAD ops |

## Validation evidence

- Ownership table lists `geometry-services`
- Package exists with contracts + architecture tests
- Laws appear in `ARCHITECTURE.md`
- Roadmap documented in `docs/SYSTEM_OVERVIEW.md` / constitution §19
