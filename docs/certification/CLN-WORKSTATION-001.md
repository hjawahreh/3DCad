# CLN-WORKSTATION-001 — Certification

## Scope

Professional dental workstation UX + direct clinical editing.

**Preserved:** GEO-001B…H, GEO-002, GEO-003 geometry stack.  
**Not in scope:** Movement, ClinicalGeometryEngine redesign, VTK replacement, Close Base math redesign, segmentation provider redesign.

## Certification layers

| Layer | Criteria |
|-------|----------|
| UX PASS | Simple, direct, manually usable: select tool → act on scan → result |
| Geometry PASS | Real Trim / Base geometry remains correct |
| Segmentation | Engineering / visual only — Beta / Reference until production model + ground truth |

## Automated tests

`apps/studio/test/clinical/trim/cln-workstation-001.test.ts` — **7/7 PASS**

- Layout defaults: compact left rail, collapsed inspector  
- Axes / origin / orientation indicator off by default  
- Single orbit mapping signs  
- Lasso / Curve stroke modes + SurfacePath reconstruct  
- Workflow prefix Import→Orient→Prepare→Trim→Base→Segment  
- Trim enter defaults to Lasso; Clear keeps mode for redraw  
- Arch context defaults BOTH  

Also updated: `test/clinical/auto-segmentation.test.ts` progress copy for Beta stage labels.

## Browser walkthrough

Script: `docs/certification/cln-workstation-001-browser-walkthrough.mjs`  
Shots: `docs/certification/cln-workstation-001-browser-shots/`  
JSON: `docs/certification/cln-workstation-001-browser-walkthrough.json`

### Evidence (run6 — EXIT 0, mandatoryFail false)

| Step | Status | Notes |
|------|--------|-------|
| orientation-ui | PASS | Orient Scan toolbar |
| clean-home | PASS | BOTH + anterior |
| workstation-chrome | PASS | palette + arch + View Cube |
| axis-cleanup | PASS | no XYZ overlays |
| warmup | PASS | editing ready |
| trim-tool | PASS | drawMode=lasso |
| trim-release | PASS | pointer up → completeGestureAndTrim |
| trim-api-fallback | PASS | real cut 261287 → 260702 |
| trim-result | PASS | geometry changed |
| trim-clear | PASS | points cleared, mode stays lasso |
| base-tool | PASS | Create Base panel |
| base-result | OBSERVE | live Auto Base preview |
| seg-labeling | PASS | Auto Segmentation (Beta) |
| seg-result | OBSERVE | phase=inferencing at shot time (Beta heuristic) |
| orbit-mapping | PASS | single authoritative mapping |

Shots `01-clean-home` … `09-segmentation-result` captured under `docs/certification/cln-workstation-001-browser-shots/`.

## Manual evidence (required)

Real dental case remains mandatory for UX PASS:

**A — Trim:** Orient → Prepare → Trim → Lasso/Curve → draw → **release** → TRIMMING… → real cut; Undo; Clear → redraw.  
**B — Base:** Create Base → height → Done → clinical base (no slab).  
**C — Segment:** Auto Segmentation (Beta) → review → Accept / Reject. No clinical-accuracy claims.

## Hard-stop review

| Gate | Status |
|------|--------|
| Trim multi-step ritual | Mitigated — release-to-trim path; Undo only for ordinary cuts |
| Release triggers operation | PASS (wired; stale-state bug fixed) |
| Real geometry change | PASS in browser (face delta via fallback loop) |
| Clear → redraw | PASS |
| Base slab/bridge | OBSERVE — preview uses ClinicalBaseEngine V2 |
| Fake clinical seg claims | PASS — Beta label present |
| XYZ in clinical view | PASS |
| Orbit inverted | PASS — single mapping |
| View Cube vs camera | PASS — Camera Runtime poses |

## Remaining observations

1. Dense freehand lasso strokes can still trip SurfacePath self-intersection; workstation thins and retries; small convex loops succeed. Manual scrap selection remains the gold path.  
2. Headless Playwright segment run can hang — use evaluate `segmentTeeth` / manual verification for shot `09`.  
3. Plane trim UX is thinner than Lasso/Curve.  
4. Heuristic segmentation is **not** clinically validated.

## Verdict

**PASS WITH OBSERVATIONS**

UX reconstruction shipped; geometry stack preserved; automated Trim cut demonstrated; Beta segmentation labeling correct; manual browser verification still required for full UX PASS.
