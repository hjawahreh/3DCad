# ADR-0005: Governance freeze, Release Certification, and Clinical programme

- Status: accepted
- Date: 2026-07-26
- Owners: architecture / platform
- Decision scope: Freeze governance processes; Release Certification reports; milestone lifecycle states; post-PC-001 CLN programme

## Context

Constitution, platform architecture, and implementation governance (ADR-0003/0004) are complete. Further process invention would add complexity without value. The organisation needs a production-ready definition (Release Certification) and a clean split between platform (COD/PC) and product (CLN) programmes.

## Decision

1. **Governance Freeze.** Levels 1–3 are frozen: Engineering Constitution, Platform Architecture, Governance. Level 4 (Implementation) is active. No new governance processes without an ADR that proves an existing checklist is insufficient.
2. **Release Certification.** Every COD-007+ (and later CLN) milestone ends with a [Certification Report](../templates/CERTIFICATION_REPORT.md) marked PASS or FAIL. “Done” without certification is invalid.
3. **Milestone lifecycle:** Draft → Implementation → Feature Complete → Verification → Certified → Frozen ([MILESTONE_LIFECYCLE.md](../engineering/MILESTONE_LIFECYCLE.md)).
4. **Post-PC-001:** Stop COD numbering for product work. Start Clinical programme `CLN-001…`. Clinical milestones still use readiness checklist + certification reports and may not expand platform architecture.
5. **PC-001** is an aggregate Platform Certification Report ([PC001_PLATFORM_CERTIFICATION.md](../templates/PC001_PLATFORM_CERTIFICATION.md)) producing e.g. Platform v1.0 Certified.
6. **Review protocol** ([REVIEW_PROTOCOL.md](../engineering/REVIEW_PROTOCOL.md)) is the sole ongoing review structure; reviewer roles shift to compliance/certification authority.

## Consequences

Reviews focus on certification reports, implementation quality, performance evidence, and contract compliance—not new architecture or process design.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Keep inventing governance checklists | Process churn; delays implementation |
| Continue COD after PC-001 for clinical | Blurs platform vs product |

## Validation evidence

- Constitution §19 references Release Certification, lifecycle, CLN programme, Governance Freeze
- Templates and engineering docs landed
