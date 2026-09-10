# Platform Milestone Review Protocol

**Effective immediately.** Platform definition is complete. Reviews are an engineering programme, not an architecture exercise.

## Reviewer charter

| Role | Focus |
| ---- | ----- |
| Technical Reviewer | Correctness, API quality, threading, ownership, cancellation, diagnostics |
| Architecture Compliance Reviewer | Boundaries, dependencies, contract bypass |
| Certification Authority | PASS / PASS WITH OBSERVATIONS / FAIL |

Architectural expansion is out of scope unless implementation demonstrates a limitation that cannot be resolved within the frozen constitution (then ADR only).

## Criteria hierarchy

1. Correctness — contracts satisfied  
2. Constitution compliance — boundaries held  
3. Test evidence — objective verification  
4. Performance evidence — documented budgets  
5. Code quality — maintainable  

Architectural novelty is **not** a success criterion.

## Review sequence (COD-007 onward)

### 1. Scope verification

- Does the implementation satisfy the milestone contract?  
- Were only the intended packages changed?  

### 2. Constitution compliance

- Any architectural boundary violations?  
- Any dependency rule violations?  
- Any implementation that bypasses established contracts?  

**If yes → FAIL** unless an approved ADR exists.

### 3. Technical quality

- Public API quality  
- Error handling  
- Threading correctness  
- Ownership / lifetime correctness  
- Cancellation and diagnostics (where applicable)  

### 4. Evidence

- Unit tests  
- Integration tests  
- Architecture tests  
- Cross-package compatibility tests  
- Coverage of critical paths  

### 5. Performance

- Measured results  
- Comparison with documented budgets  
- Regression analysis  

### 6. Certification

| Decision | Meaning |
| -------- | ------- |
| **PASS** | Milestone certified |
| **PASS WITH OBSERVATIONS** | Certified; non-blocking issues documented |
| **FAIL** | Blocking reasons; not certified |

Recommendations limited to: implementation defects, compliance issues, measurable performance concerns, test gaps, certification blockers.

## Evidence standard

Claims such as “production ready”, “commercial quality”, “enterprise grade”, or “certified” require evidence:

- passing automated tests  
- performance measurements  
- contract validation  
- dependency analysis  
- successful certification reports  

## Platform status

```text
Architecture     ✓ Frozen
Governance       ✓ Frozen
Contracts        🟡 Stabilising until PC-001
Implementation   ► Active
Certification    ► Continuous
```

## PC-001

When COD-013 completes, evaluate the platform as a **complete system** via [PC001_PLATFORM_CERTIFICATION.md](../templates/PC001_PLATFORM_CERTIFICATION.md):

Architecture compliance · Contract completeness · Runtime correctness · Integration quality · Performance evidence · Documentation completeness · Governance compliance  

**PASS** → **Platform v1.0 Certified** → clinical programme (CLN-*). Platform stays fixed; reviews shift to orthodontic functionality on the certified foundation.
