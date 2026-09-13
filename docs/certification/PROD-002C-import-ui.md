# PROD-002C — Production Import UI

**Status:** READY FOR BROWSER CERTIFICATION (not claimed PASS)  
**Date:** 2026-09-12  
**Baseline:** PROD-002 / PROD-002A / PROD-002B  
**Scope:** Studio clinical Import UI — create case, parse, validate, show result, continue toward preparation via Orientation

## Required workflow (implemented)

1. Open Studio (empty state)  
2. Create Case → select Upper/Lower dental files  
3. Parse (existing import coordinator)  
4. Validate (`validateClinicalCase` → `getLastCaseValidation`)  
5. Show structured validation result in clinical UI (ERROR / WARNING / INFO)  
6. Persist clinical case  
7. Continue to Orientation (preparation auto-runs after Orient Accept — architecture lock)

## UI capabilities

| Case | Handling |
|------|----------|
| Successful import | Success panel + validation + continue |
| Malformed / damaged file | Clinical error copy; retry arch |
| Unsupported format | Blocked at file pick with clinical message |
| Empty mesh / empty file | Clinical error; not accepted |
| Invalid geometry | Validation FAIL / ERROR findings shown |
| Warnings | Shown — not hidden (`ClinicalCaseValidationPanel`) |
| Fatal validation | Continue disabled until resolved |
| Progress / large files | Progress bar; large-file status copy |
| Cancellation | Cancel import during create/import busy (`importController.cancel`) |

## Architecture honors

- Source geometry preserved (import/registry path unchanged)  
- No platform redesign; wires existing coordinator + case validation  
- No internal quality codes exposed in clinical copy  
- Orientation remains required before Preparation

## Automated gates

| Gate | Result |
|------|--------|
| typecheck | **PASS** |
| tests (`prod-002c-import-ui` + clinical import/case/workflow + architecture) | **PASS** |
| build | **PASS** |
| architecture | **PASS** |
| Interactive browser | **Not claimed** — runner prepared at `docs/certification/prod-002c-import-ui-walkthrough.mjs` |

## Browser certification runner

```bash
# Terminal A
pnpm --filter @cad-studio/studio dev

# Terminal B
NODE_PATH=/path/to/playwright/node_modules \
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
  node docs/certification/prod-002c-import-ui-walkthrough.mjs
```

Evidence outputs (when run):

- `docs/certification/prod-002c-import-ui-shots/`
- `docs/certification/prod-002c-import-ui-walkthrough.json`

## Verdict

**PROD-002C implementation: READY**  
**Browser PASS: NOT CLAIMED** until the walkthrough is executed and evidence is attached.
