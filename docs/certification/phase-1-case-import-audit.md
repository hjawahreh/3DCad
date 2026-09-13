# Phase 1A — Case Creation & Import Workflow Audit

**Date:** 2026-09-11  
**Scope:** Patient + case creation → dual-arch import → persistence → reopen → Orient ready  
**Status:** Audit complete — implementation may begin  
**Rule:** Frozen platforms must not be redesigned (Geometry Kernel, Clinical Engine, Manufacturing, Enterprise Runtime, CAD Platform, Trim, Close Base, Segmentation, Session/History/Undo, Viewport Runtime, Camera Runtime, existing persistence adapters unless genuinely missing)

---

## 1. Existing architecture

### Boot & shell

| Layer | Location | Behavior |
|-------|----------|----------|
| Entry | `apps/studio/src/main.tsx` → `App.tsx` | Starts `ClinicalApplication`, mounts `ClinicalShell` |
| Shell | `apps/studio/src/clinical/shell/*` | Full clinical chrome (header, workflow bar, panels, viewport) |
| Empty surface | `ClinicalEmptyState.tsx` | Overlay on empty viewport: **Import Scan** / **Open Case** |

There is **no home / welcome / case-picker route**. The operator lands in the clinical CAD shell with an empty viewport overlay.

### Patient / case domain

| Concept | Exists as | Notes |
|---------|-----------|-------|
| Patient | `PatientMetadata` in `ClinicalDocument.ts` | Embedded fields only: `patientId`, `displayName`, `chartNumber?`, `notes?` |
| Case | `CaseMetadata` + `ClinicalDocumentSnapshot` | Branded `ClinicalCaseId`; name, timestamps, clinician/practice/tags |
| Relationship | 1:1 embed on document | No patient registry; no patient→many-cases graph |
| Factory | `createEmptyClinicalDocument` | Defaults: `Untitled Case` / `Unassigned Patient`; ids `case-${now}` / `patient-${now}` |

**No** standalone `Patient` entity, `PatientRepository`, or patient CRUD service.

### Case / session runtime

| Piece | Path | Role |
|-------|------|------|
| `ClinicalRuntime` | `runtime/ClinicalRuntime.ts` | Owns tools + recent registry; single session |
| `ClinicalSession` | `runtime/session.ts` | At most one `activeCase`; `newCase` / `openCase` / `closeCase` / dirty |
| `CaseManager` | `case/CaseManager.ts` | Thin façade over session |
| Lifecycle | `runtime/lifecycle.ts` | `ready` → `case-active` → `case-dirty` → `closing` |

`openCase(document)` already accepts a full `ClinicalDocumentSnapshot` (in-memory). UI does not supply one from storage.

### Persistence

| Piece | Status |
|-------|--------|
| `CasePersistenceContract` (`save` / `load`) in `case/RecentCases.ts` | **Declared; no implementers** |
| `clinical.case.save` | Clears dirty flag + toast only — **no I/O** |
| `clinical.case.open` | Opens `open-project` dialog with placeholder copy |
| `RecentCasesRegistry` | **Working** localStorage MRU index (`cad-studio.clinical.recent.v1`) — metadata only |
| Mesh payloads | **Not** in document snapshot (by design — descriptors only) |
| Geometry | Live in kernel `MeshRegistry` after import; lost on reload |

Host already persists prefs/layout/settings via localStorage (`ClinicalDisplayPreferences`, `ClinicalLayout`, `ApplicationSettings`). Pattern exists; case+mesh durable store does not.

### Import stack (reusable)

| Piece | Path | Status |
|-------|------|--------|
| Coordinator | `import/ClinicalImportCoordinator.ts` | Production dual-arch orchestration |
| Controller / session | `ClinicalImportController.ts`, `ClinicalImportSession.ts` | UI façade + cancel |
| Parsers | `ClinicalMeshParsers.ts` | STL (bin/ASCII), OBJ, ASCII PLY |
| Formats | `CLINICAL_IMPORT_FORMATS` | `stl` \| `obj` \| `ply` |
| Arch role | `ClinicalArchRole = 'upper' \| 'lower'` | UI-assigned; filename heuristic `suggestArchRole` |
| Document builder | `ClinicalDocumentBuilder.ts` | Stable ids `{caseId}:upper-arch` / `:lower-arch`; replace conflict |
| Scene publish | `ClinicalSceneBuilder.ts` | Viewport publish |
| Progress | `ClinicalImportObservability.ts` + Import Runtime progress | Real phase/ratio (not fake %) |
| Dialog | `shell/ClinicalImportDialog.tsx` | Upper/Lower pickers, replace prompt, progress |

Import **auto-creates** a case (`Case · {fileName}` / `Unassigned Patient`) when none is active.

### Workflow / navigation

| Piece | Reality |
|-------|---------|
| Presentation steps | `ClinicalWorkflowPresentation.ts`: Import → Orient → Prepare → Trim → … |
| Explicit Phase-1 enums (`CASE_CREATED`, `IMPORTING`, …) | **Do not exist** |
| Import-complete → Orient | Inferred from `objects.length` + presentation checklist |
| Preparation stages | Downstream (`orientation-complete`, `ready-for-trim`, …) — do not invent a second machine |

### UI / notifications / validation

- Notifications: `application/notifications.ts` + `shell/NotificationHost.tsx` (incl. progress)
- Dialogs: `overlays.ts` kinds `import | settings | diagnostics | about | open-project` — **no `new-case`**
- Import validation: format gate + parser empty/invalid geometry + arch conflict
- Header shows case name + patient displayName (read-only)

### Tests & fixtures

- `apps/studio/test/clinical/import.test.ts`, `clinical.test.ts`, `workflow-presentation.test.ts`
- Fixtures: `apps/studio/public/clinical-fixtures/upper.stl`, `lower.stl`
- Browser walkthroughs: `docs/certification/pre-cln011-*`, `pre-cln012-*`

---

## 2. Existing reusable components

**Reuse as-is (do not rebuild):**

1. `ClinicalDocumentSnapshot` / `PatientMetadata` / `CaseMetadata`
2. `ClinicalSession.newCase` / `openCase` / dirty guards
3. `CaseManager` façade
4. `RecentCasesRegistry` (+ extend entry fields if needed)
5. `CasePersistenceContract` port — **implement** in studio host, do not redesign
6. Full import pipeline: coordinator → parsers → document builder → mesh registry → scene
7. `ClinicalImportDialog` patterns (arch pickers, progress, replace) — extend/wrap for create-case UX
8. `ClinicalEmptyState`, workflow presentation Import step CTAs
9. `NotificationHost`, `DialogHost` / `ModalHost`
10. Command ids: `clinical.case.{new,open,close,save,recent}`, `clinical.tool.import`
11. Design tokens + `clinical.css` dark CAD identity
12. Existing Vitest clinical test harness + STL fixtures

---

## 3. Existing gaps

| Capability | Gap |
|------------|-----|
| Create Patient UI | No form; only optional `patientName` on `newCase` |
| Create Case UI | Command creates empty defaults; no clinical form |
| Dual-arch create+import as one deliberate flow | Import dialog exists but is scan-only; empty state jumps to Import |
| Durable case persistence | Contract unused; Save is no-op I/O |
| Mesh rehydration on reopen | Descriptors persist nowhere; MeshRegistry emptied on reload |
| Open Case | Placeholder dialog + toast |
| Recent → open | List is display-only / toast-only |
| Workflow status on recent cards | Index has name/patient/time only — no status |
| Empty state | Technical “Import Scan” framing; no **+ New Case** primary |
| Case header completeness | Patient/case shown; workflow step via bar; no structured “ready for orientation” confirmation after import |
| Drag-drop on import dropzones | CSS present; handlers missing (nice-to-have) |
| Worker parse | Main-thread parse (out of scope to redesign; use honest progress) |
| Explicit Phase-1 state enum | Prefer mapping onto existing lifecycle + presentation; optional lightweight `workflowPhase` on document if needed for reopen |
| Duplicate case policy | Dirty guard only; preserve intentional duplicates (timestamp ids) |

---

## 4. Proposed minimal implementation

### Principle

Smallest host-owned adapters + presentation UX. No new clinical engines. No parallel session/runtime. No Trim/Orient/Prep/Viewport/Camera redesign. Do **not** implement Auto Orientation.

### 4.1 Domain (minimal extensions)

- Extend `createEmptyClinicalDocument` / `newCase` inputs to accept: first/last or display name, optional patient ID/chart, case name, notes (map onto existing `PatientMetadata` / `CaseMetadata` — **no duplicate fields**).
- Optional lightweight `workflowPhase` on document **only if** reopen cannot be inferred from objects + preparation state:
  - Prefer infer: no objects → import; both arches present → import complete / orientation ready.
  - If stored, values aligned to presentation: `case-created` | `importing` | `import-complete` | `orientation-ready`.

### 4.2 Persistence adapter (studio host)

Implement `CasePersistenceContract` once:

- Store: IndexedDB (preferred for mesh bytes) with localStorage fallback for metadata index.
- Persist: document snapshot JSON + **source mesh bytes** (or reconstructed buffers) keyed by object id / arch.
- On save after successful import (and explicit Save): write document + meshes.
- On load: restore snapshot → `session.openCase` → re-register meshes into `MeshRegistry` → republish scene → restore presentation step.

Extend `RecentCaseEntry` with workflow status label derived from document (not invented).

### 4.3 UX surfaces

1. **Empty state** — primary **+ New Case**, secondary **Open Case**, recent cases list below when present.
2. **Create Case dialog** — Patient (first/last or display name + optional ID) / Case (name + optional notes) / Upper Arch + Lower Arch file cards → **Create Case** (creates case then imports both using existing coordinator).
3. **Import progress** — reuse existing progress bus; user-facing messages: Preparing / Reading / Loading Upper Arch / Loading Lower Arch / Finalizing.
4. **Success** — concise confirmation + **Continue to Orientation** → existing `clinical.tool.orient` (no fake orientation).
5. **Partial failure** — keep case + successful arch; **Retry** failed arch only.
6. **Open Case** — recent list with patient, case, updated time, workflow status; click loads persisted case.
7. **Header** — keep patient + case + dirty; ensure current step remains visible via workflow bar.

### 4.4 Commands / overlays

- Add dialog kind `new-case` (or reuse `import` expanded) via `DialogHost`.
- Wire `clinical.case.new` → create dialog (not silent empty case).
- Wire `clinical.case.open` → case picker from persistence + recent.
- Wire `clinical.case.save` → persistence adapter + clear dirty.
- Recent list clickable → open.

### 4.5 Tests

- Patient/case create + persist + retrieve (adapter + session).
- Import valid/invalid/empty/unsupported + partial fail/retry.
- Workflow: new → import complete → orientation ready; reopen restores identity + scans + step.
- UI smoke where existing test patterns allow.

### 4.6 Explicitly out of scope this phase

Auto Orientation, Preparation redesign, Trim/Close Base/Segmentation changes, workers for parse, Geometry Kernel changes, fake orientation results.

---

## 5. Files expected to change

### Likely modify

- `apps/studio/src/clinical/document/ClinicalDocument.ts` — create inputs; optional workflow phase field
- `apps/studio/src/clinical/runtime/session.ts` — pass-through create fields if needed
- `apps/studio/src/clinical/case/CaseManager.ts` — save/load via persistence port
- `apps/studio/src/clinical/case/RecentCases.ts` — richer recent entry; keep contract
- `apps/studio/src/clinical/register-commands.ts` — new/open/save wiring
- `apps/studio/src/clinical/shell/ClinicalEmptyState.tsx` — New Case + recent
- `apps/studio/src/clinical/shell/ClinicalImportDialog.tsx` and/or new create-case dialog sibling
- `apps/studio/src/clinical/shell/ClinicalDialogHost.tsx` — host new dialogs
- `apps/studio/src/clinical/shell/ClinicalLeftPanel.tsx` — clickable recent
- `apps/studio/src/clinical/shell/ClinicalWorkflowPresentation.ts` — import-complete / orientation-ready CTAs
- `apps/studio/src/clinical/shell/ClinicalHeader.tsx` — minor clarity if needed
- `apps/studio/src/clinical/styles/clinical.css` — create-case / recent / empty polish
- `apps/studio/src/application/overlays.ts` — dialog kind
- `apps/studio/src/application/composition-root.ts` or `ClinicalBootstrap.ts` / `ClinicalWorkspace.ts` — wire persistence adapter + reopen hydration
- `apps/studio/src/clinical/import/ClinicalImportCoordinator.ts` — only if needed for create-case batch / messaging (minimal)
- Tests under `apps/studio/test/clinical/`
- Certification: this audit + later `phase-1-case-import.md`

### Likely add (minimal)

- `apps/studio/src/clinical/case/ClinicalCasePersistence.ts` (or `apps/studio/src/application/…`) — IndexedDB adapter implementing `CasePersistenceContract` + mesh blob store
- `apps/studio/src/clinical/shell/ClinicalCreateCaseDialog.tsx` — patient/case/scan form
- `apps/studio/src/clinical/shell/ClinicalOpenCaseDialog.tsx` — recent/open picker
- `apps/studio/test/clinical/case-persistence.test.ts` (and/or create-case workflow test)

---

## 6. Files explicitly protected from modification

Do **not** redesign or rewrite:

| Platform | Paths |
|----------|-------|
| Trim | `apps/studio/src/clinical/trim/**` (esp. operation, boundary math, history, runtime) |
| Close Base | `apps/studio/src/clinical/close-base/**` |
| Segmentation | `apps/studio/src/clinical/segmentation/**` |
| Viewport Runtime (platform) | `packages/viewport-runtime/**` |
| Camera Runtime (platform) | `packages/camera-runtime/**` |
| Clinical display runtime core | `ClinicalViewportRuntime.ts`, `ClinicalAnteriorCamera.ts` — touch only if reopen must republish scene via existing APIs |
| Session / History / Undo stacks | `runtime/session.ts` lifecycle semantics; `packages/tool-runtime`; per-tool `*History.ts` — only additive pass-through for create fields / open hydration |
| Geometry Kernel | `apps/studio/src/geometry-kernel/**`, mesh registry internals |
| Import Runtime package | `packages/import-runtime/**` — compose, do not replace |
| Project Runtime | `packages/project-runtime/**` — not clinical patient/case |
| Orientation algorithm / auto-orient | `apps/studio/src/clinical/orientation/**` — may invoke enter Orient; must not auto-complete or fake results |
| Preparation / Trim workflow logic | `preparation/**` — no auto-prep |

**Allowed touch pattern:** call existing public methods (`openCase`, `importSelectedFile`, `presentClinicalAnteriorView`, register mesh helpers) from new host adapters/UI.

---

## Audit verdict

| Area | Ready? |
|------|--------|
| Dual-arch import | Yes — reuse |
| Patient/case metadata shape | Yes — extend inputs only |
| Create/Open UX | Missing — build |
| Persistence + reopen | Missing — implement `CasePersistenceContract` |
| Recent cases | Index yes; open wiring missing |
| Orient ready (no fake orient) | Presentation path exists |
| Frozen platforms | Intact — keep them so |

**Next:** Phase 1B–1C implementation per §4, then typecheck/tests/build, then **stop for operator browser verification** before any Phase 2 work.
