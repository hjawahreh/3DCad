# Repository Governance, Versioning, and Releases

**Status: Governance Frozen (ADR-0005).** Do not add new governance processes without an ADR. Prefer executing existing checklists.

## Frozen layers

| Level | Content | State |
| ----- | ------- | ----- |
| 1 | Engineering Constitution | Frozen |
| 2 | Platform Architecture | Frozen |
| 3 | Governance | Frozen |
| 4 | Implementation | **Active** |

## Ownership

Every package has one accountable team, documented public boundary, test command, and architecture reference. Ownership is recorded in the package manifest/metadata and enforced through CODEOWNERS. Shared code has a primary owner; review does not transfer ownership.

## Implementation programme

From COD-007 onward, milestones are **implementations of already-defined contracts**:

| Milestone | Goal |
| --------- | ---- |
| COD-007 | Scene Projection implementation |
| COD-008 | Viewport Runtime implementation |
| COD-009 | Interaction Runtime implementation |
| COD-010 | Camera Runtime implementation |
| COD-011 | Selection Runtime implementation |
| COD-012 | Project Runtime implementation |
| COD-013 | Import Runtime implementation |

Required for each:

- [Implementation Readiness Checklist](IMPLEMENTATION_READINESS.md)
- [Milestone lifecycle](MILESTONE_LIFECYCLE.md) through **Certified**
- PASS [Certification Report](../templates/CERTIFICATION_REPORT.md)

**PC-001** is an aggregate [Platform Certification Report](../templates/PC001_PLATFORM_CERTIFICATION.md), not another COD. After PC-001, product work uses **CLN-*** milestones.

Ongoing reviews follow [REVIEW_PROTOCOL.md](REVIEW_PROTOCOL.md).

### Milestone review questions

1. Does the implementation conform to the constitution?  
2. Does it satisfy the milestone’s acceptance criteria?  
3. Does it improve the platform without expanding its architectural surface?

## Contract stability policy

| Level | Meaning |
| ----- | ------- |
| **Experimental** | May change freely before PC-001 |
| **Stable** | Compatible changes only; ADR for breaks |
| **Frozen** | Breaking changes prohibited (post-PC-001 certified) |

## Version policy

Independent semver for product, project format, IPC, kernel ABI, plugin SDK. Major/breaking changes require ADR (forbidden on Frozen surfaces).

## Release policy

Release candidates from tagged protected commits with pinned dependencies, SBOM, license report, security scan, provenance, tests, and signed artifacts. Promotion does not rebuild. Rollback promotes a prior verified artifact.

## Dependency policy

New dependencies require owner, license/security review, rationale, footprint, and removal plan. Lockfiles committed. No private cross-package imports.
