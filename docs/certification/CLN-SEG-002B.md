# CLN-SEG-002B — Close Validation and Browser Evidence Gates

**Status:** FAIL
**Scope:** Engineering close-validation evidence only. No clinical validation claim.

## Implementation evidence

- Vitest now starts the real `tools/geometry-backend-bench/vtk_worker_http.py`
  sidecar when port `8765` is unavailable and returns a teardown hook for
  workers it owns.
- Native VTK Python resolution falls back to the selected local Python runtime
  when the optional benchmark virtualenv is absent.
- Segmentation acceptance rechecks the live kernel mesh when legacy document
  descriptors do not yet contain fingerprint/revision metadata; stale results
  remain rejected when the live binding differs.
- Trim enters with an explicit idle interaction state, supports non-mutating
  mode selection during warmup, and keeps surface-bound geometry readiness
  checks in the point path.
- Close Base enforces a zero/invalid time budget and avoids ratio-only area
  rejection for sparse decimated scan inputs.

## Automated evidence

| Check | Result |
| --- | --- |
| Focused segmentation workflows | PASS, 27/27 |
| Focused preparation/Trim workflow | PASS, 10/10 |
| Close-base hardening and regression corpus | PASS, 17/17 |
| GEO-002 performance | PASS, 5/5 in isolated run |
| Full `pnpm test` | FAIL, 503 passed, 12 failed, 12 skipped, 5 unhandled errors |
| GEO-003 warmup performance | FAIL, first VTK trim exceeded fixed 3.78 s budget |

The remaining full-suite failures include contradictory existing Trim
expectations (`idle` versus default `lasso`, and screen-space miss handling),
one long real-fixture regression test exceeding its default test timeout, and
Vitest task-update timeouts while the real dental fixture suites run. These are
not represented as PASS evidence.

## Browser evidence

No new browser walkthrough was completed for CLN-SEG-002B. Existing browser
artifacts remain historical observations and do not prove the requested full
Import → Orientation → Prepare → Trim → Base → Segmentation path. Status:
**FAIL / evidence incomplete**.

## Certification decision

**FAIL.** The production binding and focused runtime contracts are implemented
and tested, but the full regression gate and complete browser evidence are not
closed. Production model availability and clinical validation remain separate
requirements.