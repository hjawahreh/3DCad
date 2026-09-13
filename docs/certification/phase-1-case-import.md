# Phase 1 — Case Creation & Import Certification

**Date:** 2026-09-11  
**Scope:** Patient + case creation → dual-arch import → persistence → reopen → Orient ready  
**Verdict:** **PASS WITH OBSERVATIONS** (automated gates green; **operator browser verification pending**)

---

## Implementation summary

Phase 1 delivers a professional create/open case entry without redesigning frozen platforms.

1. **Create Case dialog** — patient (first/last, optional ID), case (name/notes), Upper Arch + Lower Arch file cards → Create Case → import via existing coordinator → save → success + **Continue to Orientation** (enters existing Orient tool; does not auto-orient).
2. **Open Case dialog** — lists persisted cases with patient, case name, workflow status, timestamp.
3. **Empty state** — + New Case / Open Case + recent cases.
4. **Persistence** — `CasePersistenceContract` implemented (IndexedDB in browser; in-memory for tests). Saves document snapshot + mesh buffers; reopen hydrates MeshRegistry + scene.
5. **Workflow status** — derived from document (`case-created` / `importing` / `orientation-ready`); no fake Orient/Prep completion.
6. **Save command** — writes through `ClinicalCaseService` (no longer a dirty-flag-only placeholder).

Audit: `docs/certification/phase-1-case-import-audit.md`

---

## Architecture impact

| Area | Impact |
|------|--------|
| Geometry Kernel / MeshRegistry | Used via existing `registerParsedClinicalMesh` only |
| Import Runtime / ClinicalImportCoordinator | Reused; not replaced |
| Trim / Close Base / Segmentation | Untouched |
| Viewport / Camera runtimes | Untouched (reopen calls existing anterior present) |
| Session / History / Undo | Additive create-field pass-through; openCase already existed |
| Orientation | Enter tool only — **no auto orientation** |

---

## Files changed (primary)

### Added
- `apps/studio/src/clinical/case/ClinicalCasePersistence.ts`
- `apps/studio/src/clinical/case/ClinicalCaseService.ts`
- `apps/studio/src/clinical/case/ClinicalCaseWorkflowStatus.ts`
- `apps/studio/src/clinical/shell/ClinicalCreateCaseDialog.tsx`
- `apps/studio/src/clinical/shell/ClinicalOpenCaseDialog.tsx`
- `apps/studio/test/clinical/case-persistence.test.ts`
- `docs/certification/phase-1-case-import-audit.md`
- `docs/certification/phase-1-case-import.md` (this file)

### Modified
- `ClinicalDocument.ts`, `session.ts`, `CaseManager.ts`, `RecentCases.ts`
- `ClinicalWorkspace.ts`, `register-commands.ts`
- `ClinicalEmptyState.tsx`, `ClinicalDialogHost.tsx`, `ClinicalLeftPanel.tsx`
- `ClinicalWorkflowPresentation.ts`, `overlays.ts`, `clinical.css`
- `CASE-MODEL.md`, `workflow-presentation.test.ts`

---

## Files protected (untouched platforms)

- `apps/studio/src/clinical/trim/**`
- `apps/studio/src/clinical/close-base/**`
- `apps/studio/src/clinical/segmentation/**`
- `packages/viewport-runtime/**`
- `packages/camera-runtime/**`
- Geometry kernel internals (registry used as consumer only)
- Orientation algorithms / auto-orient
- Preparation / Trim geometry pipelines

---

## Tests

| Gate | Result |
|------|--------|
| Typecheck (`pnpm --filter @cad-studio/studio typecheck`) | **PASS** |
| Unit / clinical Vitest (`pnpm --filter @cad-studio/studio test`) | **PASS** — 178 tests |
| Build (`pnpm --filter @cad-studio/studio build`) | **PASS** |
| Browser (operator) | **PENDING** |

New coverage in `case-persistence.test.ts`: patient/case create, persist/retrieve, dual-arch import save/reopen, invalid/empty mesh, partial fail + retry, workflow phase derivation.

---

## Browser verification

**Not yet performed by the agent.** Operator must run the manual checklist below before upgrading verdict to PASS.

Fixtures: `apps/studio/public/clinical-fixtures/upper.stl`, `lower.stl`

---

## Known observations

1. Large STL parse remains on the main thread (existing importer); progress is honest/indeterminate-ish via import phases — workers out of scope.
2. Drag-and-drop on arch cards is browse-click only (dropzone styled); file picker is primary.
3. Preparation/Orient session state is not separately serialized — reopen correctly lands at **orientation-ready** from mesh presence (Orient not claimed complete).
4. Intentional duplicate cases remain allowed (timestamp case ids); dirty-case guard prevents silent overwrite of unsaved work.
5. Bootstrap still constructs an initial workspace; tests that inject memory persistence construct a second `ClinicalWorkspace` on the same session (test-only).

---

## Remaining limitations

- No multi-case patient registry / patient search directory
- No cloud sync — local IndexedDB only
- Binary PLY still unsupported (existing parser limit)
- Auto Orientation is explicitly **not** implemented (Phase 2+)

---

## Final verdict

**PASS WITH OBSERVATIONS**

Automated quality gates pass and frozen platforms were not redesigned. Full Phase 1 **PASS** requires successful operator browser verification of create → import → persist → reopen → Orient ready.
