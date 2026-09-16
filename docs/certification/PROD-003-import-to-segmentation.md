# PROD-003 Import → Orientation → Prepare → Trim → Close Base → Segmentation

## Workflow State Machine

Single prep milestone SoT: `PREPARATION_STAGE_ORDER`

`orientation-complete` → `ready-for-trim` → `ready-for-close-base` → `ready-for-segmentation` → `ready-for-movement`

UI bar (`STEP_META`): Import → Orient → Prepare → Trim → Close Base → Segment.

## Import

Create case + Upper/Lower STLs. SOURCE/WORKING preserved. Fingerprint recorded.

## Orientation

Auto Orient on enter; Accept Orientation required. Canonical clinical anterior unchanged.

## Preparation

`autoPrepare` / confirm creates preparation session → `ready-for-trim` + `lastMilestone: prepared`.

## Geometry Warmup

GEO-003 warmup after Prepare. Trim drawing gated until READY. Primary CTA shows “Preparing editing tools…” while warming.

## Trim

GEO-001E path. Accept → `setStage('ready-for-close-base')` + `lastMilestone: trimmed`.

## Close Base

Requires `ready-for-close-base` (not Prepare alone). ClinicalBaseEngine V2. Accept → `ready-for-segmentation` + `lastMilestone: based`.

## Segmentation

Only after Base. Runs on **working** post-Base mesh. Provider remains `reference-heuristic` (not clinical AI; not Movement-ready).

## Geometry Fingerprint Chain

Real upper evidence (`prod-003-browser-walkthrough.json`):

| Stage | Fingerprint |
| --- | --- |
| import | `geo:c828c055` |
| trim preview | `geo:1a0f6368` |
| trim accept | `geo:1a0f6368` |
| base input | `geo:1a0f6368` |
| base accept | `geo:ebd20b3f` |
| segmentation | `geo:ebd20b3f` |

Asserted:

- preview == accept (trim)
- base input == trim accept
- base accept ≠ trim accept
- segmentation geometry == base accept

## Persistence

Save → Reopen: fingerprint `geo:ebd20b3f`, face membership restored (212356 faces), provider `reference-heuristic`, status CURRENT.

## Validation

Negative gates:

| After | Base | Segment |
| --- | --- | --- |
| Prepare | locked | locked |
| Trim | unlocked | locked |
| Base | unlocked | unlocked |

## Failure Paths

Invalid Trim / failed Base do not advance stage (existing validation). Stage only advances on successful Accept.

## Performance

| Stage | ms |
| --- | --- |
| warmup (observed wait) | ~849 (may already be warm) |
| Trim | ~14849 |
| Close Base | ~26533 |
| Segmentation | ~89447 |
| Total workflow | ~345451 |

Warmup cold cost (~10 s spatial) remains documented in GEO-003 — not hidden.

## Browser Evidence

- Script: `docs/certification/prod-003-full-import-to-segmentation.mjs`
- JSON: `docs/certification/prod-003-browser-walkthrough.json`
- Shot: `docs/certification/prod-003-browser-shots/01-final.png`

**14 PASS / 0 FAIL / 0 OBSERVE**

## Automated Tests

- `test/clinical/prod-003-canonical-workflow.test.ts` — order + locks + reopen inference
- `workflow-presentation.test.ts` — green
- typecheck — green

## Remaining Observations

1. Warmup wait in E2E was short (~0.8 s) because Prepare/warmup may overlap; cold spatial cost still documented in GEO-003.
2. `prod-002s` integrity suite historically forced Segment-before-Trim for STALE tests — that is **not** the canonical product path; PROD-003 is authoritative for workstation order.
3. Movement / clinical segmentation certification not claimed.

## Certification

**PASS**

| Gate | Result |
| --- | --- |
| IMPORT | PASS |
| ORIENTATION | PASS |
| PREPARE | PASS |
| WARMUP | PASS |
| TRIM | PASS |
| CLOSE BASE | PASS |
| SEGMENTATION | PASS |
| PERSISTENCE | PASS |
| WORKFLOW ORDER | PASS |
| GEOMETRY FINGERPRINT CHAIN | PASS |
| ARCH CONTEXT | PASS |
| VALIDATION | PASS |
| BROWSER | PASS |

DO NOT CLAIM CLINICAL SEGMENTATION CERTIFICATION.  
DO NOT START MOVEMENT.
