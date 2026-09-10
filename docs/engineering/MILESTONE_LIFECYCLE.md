# Milestone Status Lifecycle

Every COD (and later CLN) milestone advances through these states. Do not skip states.

```text
Draft
  ↓
Implementation
  ↓
Feature Complete
  ↓
Verification
  ↓
Certified
  ↓
Frozen
```

| State | Meaning |
| ----- | ------- |
| **Draft** | Acceptance criteria and contracts defined; coding not started or exploratory only |
| **Implementation** | Active engineering against frozen architecture |
| **Feature Complete** | Scope delivered; tests/docs may still be unfinished |
| **Verification** | Readiness checklist + tests + performance evidence under review |
| **Certified** | [Certification Report](../templates/CERTIFICATION_REPORT.md) decision = **PASS** |
| **Frozen** | Certified surface locked per contract stability policy (no breaks without ADR; Frozen level after PC-001) |

A milestone is never “Done” without a **Certified** status and a filed certification report.
