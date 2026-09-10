# Release Certification Report

**Milestone:** COD-XXX / title  
**Package(s):**  
**Stability target:** Experimental | Stable | Frozen  
**Author:**  
**Reviewer:**  
**Date:**  

Use this report for every COD-007+ (and later CLN-*) milestone. Attach to the completing PR. Decision must be PASS or FAIL.

---

## Overview

- [ ] Scope completed as defined by milestone acceptance criteria  

**Scope summary:**

## Architecture

- [ ] Constitution compliant  
- [ ] No boundary violations  
- [ ] No dependency violations (`deps:check` / cycle detector)  

**Notes:**

## Quality

- [ ] Unit tests pass  
- [ ] Integration tests pass  
- [ ] Architecture tests pass  

**Commands / evidence:**

## Performance

- [ ] Meets documented budgets  
- [ ] No unexplained regressions vs baseline  

**Evidence:**

## Documentation

- [ ] API (`API.md`)  
- [ ] Architecture (`ARCHITECTURE.md`)  
- [ ] Ownership (`OWNERS.toml`)  
- [ ] Public contracts + stability level declared  
- [ ] [Implementation Readiness Checklist](../engineering/IMPLEMENTATION_READINESS.md) complete  

## Known Limitations

Document explicitly (or write “None”):

## Decision

**PASS** | **PASS WITH OBSERVATIONS** | **FAIL**

**Rationale:**

**Observations** (required if PASS WITH OBSERVATIONS; otherwise “None”):

**Blocking reasons** (required if FAIL; otherwise “None”):

**Sign-off:**
