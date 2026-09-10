# ADR-0003: Architecture freeze and Kernel Integration Layer (COD-006)

- Status: accepted
- Date: 2026-07-26
- Owners: architecture / platform
- Decision scope: Freeze platform layering; expand COD-006 to Kernel Integration Layer; reserve Geometry Transaction

## Context

COD-001–005 establish constitution, platform runtime, graphics engine contracts, Operation Runtime, and Geometry Services. Further structural discovery risks drift. COD-006 was listed as “Kernel Bridge”; production readiness needs a fuller **Kernel Integration Layer** still without shipping production geometry algorithms.

## Decision

1. **Architecture freeze.** From this ADR forward:
   - Architecture changes require an ADR.
   - New milestones implement existing contracts; they do not redesign layering.
   - No feature work may bypass constitutional boundaries (Laws 1–10, §17).
2. **COD-006 = Kernel Integration Layer**, four parts:
   - Kernel Bridge (opaque ABI / FFI boundary contracts)
   - Kernel Session Manager
   - Capability Negotiation
   - Geometry Services Adapters (services depend on abstract ports only)
3. **Geometry Transaction** is reserved for multi-kernel-op atomicity under a single user action (implement later).
4. Package `@cad-studio/kernel-bridge` owns the TypeScript integration contracts; native FFI arrives behind the same ports.

## Consequences

Platform work becomes execution against frozen contracts. Clinical features wait until COD-006…013 complete.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Thin FFI-only COD-006 | Leaves capability negotiation and adapters undefined |
| Continue redesigning layers per milestone | Causes architectural drift |

## Validation evidence

- Constitution §19 lists Kernel Integration Layer
- Freeze policy documented in constitution
- `@cad-studio/kernel-bridge` packages + tests
- Geometry Services adapters depend on ports, not concrete kernels
