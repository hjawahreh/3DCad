# ADR-0004: Implementation governance and Platform Certification (PC-001)

- Status: accepted
- Date: 2026-07-26
- Owners: architecture / platform
- Decision scope: End of architectural expansion; COD-007+ production subsystem rules; PC-001 gate before clinical work

## Context

COD-001–006 establish a complete platform skeleton (constitution, runtime, graphics, operation runtime, geometry services, kernel integration). Further architectural invention risks drift. The project must switch from architecture design to disciplined implementation.

## Decision

1. **Stop architectural expansion.** No new platform subsystems by default. Prefer implementing inside existing constitutional boundaries. A new layer requires an ADR that answers: *Can this be implemented within an existing boundary?* If yes, it must not become a new subsystem.
2. **COD-007 onward** are production subsystem milestones. Each must ship with: architecture docs, public API docs, unit tests, integration tests, performance expectations, and clear ownership. No constitutional changes; no new layers without ADR.
3. **Roadmap order** remains Scene → Viewport → Interaction → Camera → Selection → **Project Runtime → Import Runtime** (Project before Import so import commits to authoritative persistence contracts).
4. **Platform Certification (PC-001)** is required before any clinical/orthodontic feature work. Exit criteria are measurable checklists in `ARCHITECTURE.md` §19 (Architecture, Contracts, Quality, Runtime, Governance).
5. **Implementation Readiness Checklist** (`docs/engineering/IMPLEMENTATION_READINESS.md`) is mandatory before marking any COD milestone complete.
6. **Contract stability levels:** Experimental (pre-PC-001 free change) · Stable (compatible only; ADR for breaks) · Frozen (no breaks; post-PC-001 certified surfaces).
7. **Milestone review asks only:** constitution conformance · acceptance criteria · no architectural surface expansion.

## Consequences

Engineering focuses on fulfilling contracts and integrating layers. Clinical modules wait on PC-001.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Continue inventing platform layers | Drift; delays certification |
| Start clinical tools before PC-001 | Bypasses incomplete platform contracts |

## Validation evidence

- Constitution §20 + roadmap reference PC-001
- Governance docs list COD-007+ deliverable checklist
