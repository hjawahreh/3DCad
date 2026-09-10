# ADR-0006: Studio Host path (`apps/studio`)

## Status

Accepted for APP-001 implementation.

## Context

Frozen architecture documents named the first desktop composition root `apps/desktop`. APP-001 (Studio Host Application) requires the executable package at `apps/studio` and root `npm run dev` launching that host.

## Decision

The production Studio Host lives at **`apps/studio`** (`@cad-studio/studio`). It is the composition root formerly described as `apps/desktop`. No platform package APIs change.

## Consequences

- CODEOWNERS / docs that say `apps/desktop` refer to the same host role; path is `apps/studio`.
- Future references should prefer `apps/studio`.
- No redesign of platform packages was required.
