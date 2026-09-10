# Implementation Readiness Checklist

A COD milestone is not complete until every new or materially changed package passes this checklist. Copy into the milestone PR description and tick all boxes.

## Implementation Readiness

- [ ] Public API documented (`API.md`)
- [ ] Internal architecture documented (`ARCHITECTURE.md`)
- [ ] Ownership declared (`OWNERS.toml`)
- [ ] Allowed dependencies verified (`README.md`)
- [ ] No dependency violations (`pnpm deps:check` / cycle detector green)
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Performance expectations documented (`TESTING.md` or package architecture)
- [ ] Error model documented
- [ ] Threading model documented
- [ ] Cancellation behaviour documented (if applicable)
- [ ] Diagnostics exposed
- [ ] No constitutional violations
- [ ] [Certification Report](../templates/CERTIFICATION_REPORT.md) drafted for Verification → Certified

## Milestone review questions

Answer **yes** to all three before merging:

1. Does the implementation conform to the constitution?
2. Does it satisfy the milestone’s acceptance criteria?
3. Does it improve the platform without expanding its architectural surface?

If any answer is no, the milestone is not complete. A milestone is not **Certified** without a PASS certification report.
