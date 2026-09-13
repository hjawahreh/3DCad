# PROD-002SD Preparation Session Certification

**Scope:** Orientation → Prepare Session → Prepare Completion → Trim  
**Not in scope:** Movement, segmentation changes, Trim redesign, VTK geometry path changes  
**Clinical product certification:** Not claimed

**Verdict: PASS**

---

## Root Cause

Preparation session creation failed with `"Could not create preparation session"` when the preparation **lifecycle** already had a session (`created` / `active` / `completed`) but the controller’s early-exit guards did not apply:

1. `hasActiveSession()` required `activeSessionId`, which was often unset (especially after `hydrateClinicalPipelineFromDocument` created a lifecycle session without binding the controller id).
2. `isReadyForGeometry()` was false because the **workflow** machine stayed desynced (e.g. parked at `preparation-ready` while UI state claimed ready).
3. `createSession()` then refused with a generic conflict because `lifecycle.hasSession()` was already true.

First failing operation: `ClinicalPreparationSession.createSession` inside `ClinicalPreparationController.start`, stage **SESSION_CREATE**.

Contributing defects:

- Resume hydrate created an orphan lifecycle session that blocked a later `start()`.
- `setWorkflowPhase` double-transitioned (already at target → no-op failure) and `completeSession` could not advance from `preparation-ready` to `ready-for-geometry`.
- `complete()` cleared `activeSessionId` while leaving lifecycle at `completed`.

---

## Failing Stage

`SESSION_CREATE` — lifecycle already occupied; controller attempted a hard create instead of ensure/reuse/reset.

---

## Fix

1. **`ensureSession(binding)`** — reuse live sessions; reset terminal (`completed` / `cancelled`) sessions for retry; bind `sessionId`, `caseId`, `geometryRevision`, `geometryFingerprint`, `archMode`.
2. **Workflow sync** — allow `preparation-ready → preparation-session|validation`; `forcePhase('ready-for-geometry')` on complete; idempotent `setWorkflowPhase` when already at target.
3. **Hydrate** — restore readiness from document meta **without** orphaning a blocking lifecycle; oriented-but-not-prepared cases stay `not-started` until Prepare Case.
4. **Structured failure** — `lastFailure { stage, reason, caseId, arch, geometryRevision }` for DEV/test; user-facing message remains concise.
5. **Arch context** — preparation respects global UPPER / BOTH / LOWER when collecting arches.

---

## Preparation Session Contract

| Field | Source |
|-------|--------|
| sessionId | `prep-{caseId}-{now}` |
| caseId | active case |
| geometryRevision | document revision |
| geometryFingerprint | mesh registry fingerprints (no buffers) |
| archMode | `ClinicalArchContext` |
| lifecycle | none → created → active → completed / cancelled / failed path via `lastFailure` |

Failed creation does not mutate geometry, does not invent history, and does not leave READY.

---

## Arch Context

Default remains **BOTH**. Prepare Case records `archMode` and filters mesh inputs accordingly. Switching UPPER/LOWER changes visibility/fit targets only — not the clinical orientation frame.

---

## Geometry Revision Binding

Uses existing document `revision` + mesh `fingerprint`/`revision` from the kernel registry. No second revision system.

---

## Error Handling

- Production UI: short message (e.g. “Could not create preparation session” / validation reason).
- DEV: `data-testid="clinical-preparation-failure-diag"` shows stage/reason/caseId/arch/revision.
- Process feedback: Preparing → stage updates → complete or fail (no fake %).

---

## Retry

Retry after orphan lifecycle / cancelled / failed creation reuses `ensureSession` and does not require reload. Verified in unit test F and browser re-invoke of Prepare Case after Accept.

---

## Browser Evidence

Walkthrough: `docs/certification/prod-002sd-preparation-browser.mjs`  
Results: `docs/certification/prod-002sd-preparation-browser.json`

Screenshots: `docs/certification/prod-002sd-browser-shots/`

| File | Evidence |
|------|----------|
| 01-orientation-complete.png | Accept Orientation + auto-prepare handoff |
| 02-prepare-start.png | Prepare entry / BOTH |
| 03-preparation-session-created.png | Session ready — Continue to Trim |
| 04-continue-to-trim.png | Primary Continue available |
| 05-trim-opened.png | Trim tool active (PROD-002R-B handoff regression check) |

---

## Automated Tests

`apps/studio/test/clinical/prod-002sd-preparation-session.test.ts`

| Id | Result |
|----|--------|
| A valid oriented → create succeeds | PASS |
| B missing case → fails truthfully | PASS |
| C missing geometry → fails + diagnostics | PASS |
| D geometry revision bound | PASS |
| E UPPER arch mode recorded | PASS |
| F retry after orphan succeeds | PASS |
| G Trim handoff gate | PASS |
| H/I no geometry/revision mutation on failure | PASS |
| hydrate does not block Prepare | PASS |

Architecture tests: PASS (React still does not create/mutate preparation geometry).

---

## Prepare → Trim Handoff

After successful preparation, `isReadyForGeometry()` is true, Continue to Trim is enabled, and `clinical.tool.trim` opens Trim (`trimActive: true` in browser).

---

## Persistence

Preparation **sessions are ephemeral**. Document `preparationMeta` / `orientationMeta` are restored on reopen via `hydrateClinicalPipelineFromDocument`. If not yet prepared, Prepare Case recreates a session safely. Save uses `ClinicalCaseService.saveActiveCase`.

---

## Remaining Observations

- Auto-preparation may complete with **warnings** (`Ready with warnings…`) when mesh caches/regions need review — still READY for Trim, not FAILED.
- Probe screenshots from debugging may coexist in the shots folder; certification evidence is `01`–`05`.

---

## Validation

| Check | Result |
|-------|--------|
| typecheck | PASS |
| build | PASS |
| architecture tests | PASS |
| vitest (PROD-002SD + preparation + orientation) | PASS |
| Playwright prod-002sd-preparation-browser.mjs | PASS |

---

## Certification

**PASS**

Certifies preparation session creation / retry / Orient→Prepare→Trim handoff on real dual-arch fixtures only. Does not claim clinical product certification. Does not start Movement.
